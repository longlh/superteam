import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createPaths } from "./paths.js";
import { createQueue } from "./queue.js";
import { withTempDir } from "./testkit.js";

const id = (n) => String(n).repeat(64);

function event(order, extra = {}) {
  return {
    order,
    id: id(order),
    payload: {
      type: "t",
      data: {},
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    attempts: 0,
    errors: [],
    ...extra,
  };
}

async function setup(dir) {
  const paths = createPaths(dir);
  const queue = createQueue(paths);
  await queue.ensureFolders();
  return {
    paths,
    queue,
  };
}

test("maxOrder is 0 on an empty queue", async () => {
  await withTempDir(async (dir) => {
    const { queue } = await setup(dir);
    assert.equal(await queue.maxOrder(), 0);
  });
});

test("put writes the padded file and leaves tmp empty", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await queue.put(event(7));
    assert.deepEqual(await readdir(paths.queue), ["000007.json"]);
    assert.deepEqual(await readdir(paths.tmp), []);
    assert.equal(await queue.maxOrder(), 7);
  });
});

test("claimNext takes the smallest order and moves it to claim/", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await queue.put(event(2));
    await queue.put(event(1));
    await queue.put(event(0));
    const claimed = await queue.claimNext();
    assert.equal(claimed.key, id(0));
    assert.equal(JSON.parse(claimed.raw).order, 0);
    assert.deepEqual(await readdir(paths.claim), [`${id(0)}.json`]);
    assert.deepEqual(await readdir(paths.queue), [
      "000001.json",
      "000002.json",
    ]);
  });
});

test("claimNext gives null on an empty queue", async () => {
  await withTempDir(async (dir) => {
    const { queue } = await setup(dir);
    assert.equal(await queue.claimNext(), null);
  });
});

test("a file that is not JSON is claimed by the name of its file", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await writeFile(path.join(paths.queue, "000003.json"), "{oops");
    const claimed = await queue.claimNext();
    assert.deepEqual(claimed, {
      key: "000003",
      raw: "{oops",
    });
    assert.deepEqual(await queue.listClaims(), [claimed]);
  });
});

test("listClaims, deleteClaim", async () => {
  await withTempDir(async (dir) => {
    const { queue } = await setup(dir);
    assert.deepEqual(await queue.listClaims(), []);
    await queue.put(event(1));
    const claimed = await queue.claimNext();
    assert.deepEqual(await queue.listClaims(), [claimed]);
    await queue.deleteClaim(claimed.key);
    assert.deepEqual(await queue.listClaims(), []);
  });
});

test("toDlq writes the content to dlq/ and deletes the claim", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await queue.put(event(1));
    const { key } = await queue.claimNext();
    const failed = event(1, {
      errors: [
        {
          attempt: 1,
          error: "x",
          time: "t",
        },
      ],
    });
    await queue.toDlq(key, failed);
    assert.deepEqual(await queue.listClaims(), []);
    const file = await readFile(path.join(paths.dlq, `${key}.json`), "utf8");
    assert.deepEqual(JSON.parse(file), failed);
  });
});

test("toDlq keeps the raw text of a broken file", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await writeFile(path.join(paths.queue, "000001.json"), "{oops");
    const { key, raw } = await queue.claimNext();
    await queue.toDlq(key, raw);
    assert.equal(
      await readFile(path.join(paths.dlq, "000001.json"), "utf8"),
      "{oops",
    );
  });
});

test("clearTmp deletes every file of tmp/", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    await writeFile(path.join(paths.tmp, "half.json"), "{");
    await queue.clearTmp();
    assert.deepEqual(await readdir(paths.tmp), []);
  });
});
