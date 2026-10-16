import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fsPromises, {
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createWriter } from "./writer.js";
import { ensurePaths, getPaths } from "./paths.js";
import { sha256 } from "./event.js";

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "writer-"));
  const paths = getPaths(dir);
  await ensurePaths(paths);
  return {
    dir,
    paths,
    writer: createWriter({
      paths,
    }),
  };
}

// A local server that answers every request with `body`.
async function serve(body, status = 200) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      headers: req.headers,
    });
    res.writeHead(status);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/f`,
    requests,
    close: () => server.close(),
  };
}

test("src is written, and the hash is of the bytes", async () => {
  const { dir, paths, writer } = await setup();
  const target = path.join(dir, "out.txt");
  const hash = await writer.write({
    command: "write",
    target,
    src: "hello",
  });
  assert.equal(await readFile(target, "utf8"), "hello");
  assert.equal(hash, sha256(Buffer.from("hello")));
  assert.deepEqual(await readdir(paths.tmp), []);
});

test("src wins over remoteSrc", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "out.txt");
  await writer.write({
    command: "write",
    target,
    src: "from src",
    remoteSrc: {
      url: "http://127.0.0.1:1/never-called",
    },
  });
  assert.equal(await readFile(target, "utf8"), "from src");
});

test("the write replaces the whole file, and creates the folder", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "new", "deep", "out.txt");
  await writer.write({
    command: "write",
    target,
    src: "one long content",
  });
  await writer.write({
    command: "write",
    target,
    src: "short",
  });
  assert.equal(await readFile(target, "utf8"), "short");
});

test("file:// is read, and a binary file is kept byte for byte", async () => {
  const { dir, writer } = await setup();
  const bytes = Buffer.from([0, 255, 128, 10, 13, 0xc3, 0x28]);
  const source = path.join(dir, "source.bin");
  const target = path.join(dir, "copy.bin");
  await writeFile(source, bytes);
  const hash = await writer.write({
    command: "write",
    target,
    remoteSrc: {
      url: pathToFileURL(source).href,
    },
  });
  assert.deepEqual(await readFile(target), bytes);
  assert.equal(hash, sha256(bytes));
});

test("http is fetched with the method and the headers", async () => {
  const { dir, writer } = await setup();
  const server = await serve("remote text");
  try {
    const target = path.join(dir, "out.txt");
    await writer.write({
      command: "write",
      target,
      remoteSrc: {
        url: server.url,
        headers: {
          "x-test": "1",
        },
      },
    });
    assert.equal(await readFile(target, "utf8"), "remote text");
    assert.equal(server.requests[0].method, "GET");
    assert.equal(server.requests[0].headers["x-test"], "1");
  } finally {
    server.close();
  }
});

test("a failing source throws and leaves nothing behind", async () => {
  const { dir, paths, writer } = await setup();
  const server = await serve("nope", 500);
  try {
    const target = path.join(dir, "out.txt");
    await assert.rejects(
      writer.write({
        command: "write",
        target,
        remoteSrc: {
          url: server.url,
        },
      }),
      /500/,
    );
    await assert.rejects(readFile(target));
    assert.deepEqual(await readdir(paths.tmp), []);
  } finally {
    server.close();
  }
});

test("a target that cannot be written throws and leaves no tmp file", async () => {
  const { dir, paths, writer } = await setup();
  const blocker = path.join(dir, "blocker");
  await writeFile(blocker, "a file, not a folder");
  await assert.rejects(
    writer.write({
      command: "write",
      target: path.join(blocker, "x"),
      src: "a",
    }),
  );
  assert.deepEqual(await readdir(paths.tmp), []);
});

test("a slow server hits the timeout", async () => {
  const { dir, writer } = await setup();
  const server = http.createServer(() => {}); // never answers
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      writer.write(
        {
          command: "write",
          target: path.join(dir, "out.txt"),
          remoteSrc: {
            url: `http://127.0.0.1:${server.address().port}/`,
          },
        },
        50,
      ),
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("a target on another device throws a clear error and leaves no tmp file", async (t) => {
  const { dir, paths, writer } = await setup();
  // The named imports of a built-in module follow the mock after the sync.
  t.mock.method(fsPromises, "rename", async () => {
    throw Object.assign(new Error("cross-device link"), {
      code: "EXDEV",
    });
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  await assert.rejects(
    writer.write({
      command: "write",
      target: path.join(dir, "out.txt"),
      src: "a",
    }),
    /on another device is not supported/,
  );
  assert.deepEqual(await readdir(paths.tmp), []);
});

// The writes of the version tests: the file holds an entity at `version`.
const entity = (version) =>
  JSON.stringify({
    id: "x",
    version,
  });

test("a write with the version of the file is applied", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "task.json");
  await writeFile(target, entity(2));
  await writer.write({
    command: "write",
    target,
    version: 2,
    src: entity(3),
  });
  assert.equal(await readFile(target, "utf8"), entity(3));
});

test("a stale write is rejected, not retryable, and leaves the file and tmp as they are", async () => {
  const { dir, paths, writer } = await setup();
  const target = path.join(dir, "task.json");
  await writeFile(target, entity(3));
  await assert.rejects(
    writer.write({
      command: "write",
      target,
      version: 2,
      src: entity(3),
    }),
    (error) =>
      error.retryable === false &&
      /stale write.*version 3.*version 2/.test(error.message),
  );
  assert.equal(await readFile(target, "utf8"), entity(3));
  assert.deepEqual(await readdir(paths.tmp), []);
});

test("version 0 creates a file that does not exist, and is stale when it exists", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "new", "task.json");
  await writer.write({
    command: "write",
    target,
    version: 0,
    src: entity(1),
  });
  assert.equal(await readFile(target, "utf8"), entity(1));
  await assert.rejects(
    writer.write({
      command: "write",
      target,
      version: 0,
      src: entity(1),
    }),
    (error) => error.retryable === false,
  );
});

test("a file without a readable version is stale for a write with a version", async () => {
  const { dir, writer } = await setup();
  const plain = path.join(dir, "plain.txt");
  const noVersion = path.join(dir, "no-version.json");
  const nothing = path.join(dir, "null.json");
  await writeFile(plain, "not json");
  await writeFile(
    noVersion,
    JSON.stringify({
      id: "x",
    }),
  );
  await writeFile(nothing, "null");
  for (const target of [plain, noVersion, nothing]) {
    await assert.rejects(
      writer.write({
        command: "write",
        target,
        version: 1,
        src: "a",
      }),
      (error) => error.retryable === false && /unknown/.test(error.message),
    );
  }
});

test("a write without a version is not checked", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "task.json");
  await writeFile(target, entity(9));
  await writer.write({
    command: "write",
    target,
    src: "replaced",
  });
  assert.equal(await readFile(target, "utf8"), "replaced");
});

test("the version is checked before the content is fetched", async () => {
  const { dir, writer } = await setup();
  const target = path.join(dir, "task.json");
  await writeFile(target, entity(2));
  const server = await serve("never read");
  try {
    await assert.rejects(
      writer.write({
        command: "write",
        target,
        version: 1,
        remoteSrc: {
          url: server.url,
        },
      }),
      (error) => error.retryable === false,
    );
    assert.deepEqual(server.requests, []);
  } finally {
    server.close();
  }
});

test("an error that reads the file is not marked as not retryable", async () => {
  const { dir, writer } = await setup();
  // The target is a folder: reading it gives EISDIR, not ENOENT.
  await assert.rejects(
    writer.write({
      command: "write",
      target: dir,
      version: 1,
      src: "a",
    }),
    (error) => error.code === "EISDIR" && error.retryable !== false,
  );
});
