import assert from "node:assert/strict";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createFactory } from "./factory.js";
import { createHandlers } from "./handlers.js";
import { createLoop } from "./loop.js";
import { createPaths } from "./paths.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";
import { createClock, createSleep, withTempDir } from "./testkit.js";

async function setup(dir, { maxAttempts = 3 } = {}) {
  const paths = createPaths(dir);
  const queue = createQueue(paths);
  await queue.ensureFolders();
  const now = createClock();
  const factory = createFactory({
    queue,
    now,
  });
  const handlers = createHandlers();
  const subscribers = createSubscribers();
  const sleep = createSleep();
  const notes = [];
  for (const name of ["event:done", "event:retry", "event:error"]) {
    subscribers.subscribe(name, (data) =>
      notes.push({
        name,
        ...data,
      }),
    );
  }
  const loop = createLoop({
    queue,
    factory,
    handlers,
    subscribers,
    maxAttempts,
    pollIntervalMs: 1000,
    sleep,
    now,
  });
  return {
    paths,
    queue,
    factory,
    handlers,
    loop,
    sleep,
    notes,
  };
}

const payload = {
  type: "t",
  data: {
    n: 1,
  },
};

const names = (folder) => readdir(folder);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

test("an empty queue sleeps pollIntervalMs", async () => {
  await withTempDir(async (dir) => {
    const { loop, sleep } = await setup(dir);
    await loop.iterate();
    assert.deepEqual(sleep.calls, [1000]);
  });
});

test("success deletes the claim and emits event:done", async () => {
  await withTempDir(async (dir) => {
    const { paths, factory, handlers, loop, notes } = await setup(dir);
    const seen = [];
    handlers.handle("t", async (event) => seen.push(event));
    const event = await factory.create(payload);
    await loop.iterate();
    assert.deepEqual(seen, [event]);
    assert.deepEqual(await names(paths.claim), []);
    assert.deepEqual(await names(paths.queue), []);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].name, "event:done");
    assert.deepEqual(notes[0].event, event);
    assert.equal(typeof notes[0].time, "string");
  });
});

test("a failing handler is retried at order 0, with a wait", async () => {
  await withTempDir(async (dir) => {
    const { paths, factory, handlers, loop, notes, sleep } = await setup(dir);
    handlers.handle("t", async () => {
      throw new Error("boom");
    });
    await factory.create(payload);
    await factory.create({
      type: "t",
      data: {
        n: 2,
      },
    });
    await loop.iterate();
    assert.deepEqual(await names(paths.claim), []);
    assert.deepEqual(await names(paths.queue), ["000000.json", "000002.json"]);
    const retry = await readJson(path.join(paths.queue, "000000.json"));
    assert.equal(retry.attempts, 1);
    assert.deepEqual(retry.payload, payload);
    assert.equal(retry.errors.length, 1);
    assert.equal(retry.errors[0].attempt, 1);
    assert.equal(retry.errors[0].error, "boom");
    assert.equal(notes[0].name, "event:retry");
    assert.deepEqual(notes[0].event, retry);
    assert.equal(notes[0].error, "boom");
    assert.deepEqual(sleep.calls, []);

    await loop.iterate();
    assert.deepEqual(sleep.calls, [2000]);
    const second = await readJson(path.join(paths.queue, "000000.json"));
    assert.equal(second.attempts, 2);
    assert.equal(second.errors.length, 2);
  });
});

test("the retry waits 2 ** attempts seconds", async () => {
  await withTempDir(async (dir) => {
    const { factory, handlers, loop, sleep } = await setup(dir, {
      maxAttempts: 10,
    });
    handlers.handle("t", async () => {
      throw new Error("boom");
    });
    await factory.create(payload);
    for (let i = 0; i < 4; i++) {
      await loop.iterate();
    }
    assert.deepEqual(sleep.calls, [2000, 4000, 8000]);
  });
});

test("at maxAttempts the event goes to the DLQ with every error", async () => {
  await withTempDir(async (dir) => {
    const { paths, factory, handlers, loop, notes } = await setup(dir);
    let n = 0;
    handlers.handle("t", async () => {
      throw new Error(`boom ${++n}`);
    });
    await factory.create(payload);
    await loop.iterate();
    await loop.iterate();
    await loop.iterate();
    assert.deepEqual(await names(paths.queue), []);
    assert.deepEqual(await names(paths.claim), []);
    const [file] = await names(paths.dlq);
    const dead = await readJson(path.join(paths.dlq, file));
    assert.deepEqual(
      dead.errors.map((e) => e.error),
      ["boom 1", "boom 2", "boom 3"],
    );
    assert.deepEqual(
      notes.map((note) => note.name),
      ["event:retry", "event:retry", "event:error"],
    );
    assert.equal(notes[2].error, "boom 3");
    assert.deepEqual(notes[2].event, dead);
  });
});

test("an error with retryable false goes to the DLQ at once", async () => {
  await withTempDir(async (dir) => {
    const { paths, factory, handlers, loop, notes } = await setup(dir);
    handlers.handle("t", async () => {
      throw Object.assign(new Error("fatal"), {
        retryable: false,
      });
    });
    const event = await factory.create(payload);
    await loop.iterate();
    assert.deepEqual(await names(paths.queue), []);
    const dead = await readJson(path.join(paths.dlq, `${event.id}.json`));
    assert.equal(dead.attempts, 0);
    assert.equal(dead.errors[0].error, "fatal");
    assert.deepEqual(
      notes.map((note) => note.name),
      ["event:error"],
    );
  });
});

test("an event with no handler goes to the DLQ at once", async () => {
  await withTempDir(async (dir) => {
    const { paths, factory, loop, notes } = await setup(dir);
    const event = await factory.create(payload);
    await loop.iterate();
    const dead = await readJson(path.join(paths.dlq, `${event.id}.json`));
    assert.match(dead.errors[0].error, /no handler for t/);
    assert.equal(notes[0].name, "event:error");
    assert.match(notes[0].error, /no handler/);
  });
});

test("an event with an invalid structure goes to the DLQ at once", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue, handlers, loop, notes } = await setup(dir);
    handlers.handle("t", async () => assert.fail("must not be called"));
    const bad = {
      order: 1,
      id: "f".repeat(64),
      payload: {
        type: "t",
      },
    };
    await queue.put(bad);
    await loop.iterate();
    assert.deepEqual(
      await readJson(path.join(paths.dlq, `${bad.id}.json`)),
      bad,
    );
    assert.equal(notes[0].name, "event:error");
    assert.equal(notes[0].event, null);
  });
});

test("a queue file with broken JSON goes to the DLQ at once", async () => {
  await withTempDir(async (dir) => {
    const { paths, loop, notes } = await setup(dir);
    await writeFile(path.join(paths.queue, "000001.json"), "{oops");
    await loop.iterate();
    assert.equal(
      await readFile(path.join(paths.dlq, "000001.json"), "utf8"),
      "{oops",
    );
    assert.equal(notes[0].name, "event:error");
    assert.match(notes[0].error, /invalid JSON/);
  });
});

test("a claim left by a crash is put back at order 0 as it was", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue, factory, loop } = await setup(dir);
    const errors = [
      {
        attempt: 1,
        error: "x",
        time: "t",
      },
    ];
    const left = await factory.createAtHead(payload, 1, errors);
    await queue.claimNext();
    assert.deepEqual(await names(paths.claim), [`${left.id}.json`]);
    await loop.recoverClaims();
    assert.deepEqual(await names(paths.claim), []);
    const back = await readJson(path.join(paths.queue, "000000.json"));
    assert.equal(back.order, 0);
    assert.equal(back.attempts, 1);
    assert.deepEqual(back.errors, errors);
    assert.deepEqual(back.payload, payload);
  });
});

test("an iteration recovers a claim before it takes an event", async () => {
  await withTempDir(async (dir) => {
    const { queue, factory, handlers, loop } = await setup(dir);
    const seen = [];
    handlers.handle("t", async (event) => seen.push(event.payload.data.n));
    await factory.create({
      type: "t",
      data: {
        n: 2,
      },
    });
    await factory.createAtHead(
      {
        type: "t",
        data: {
          n: 1,
        },
      },
      0,
      [],
    );
    await queue.claimNext();
    await loop.iterate();
    await loop.iterate();
    assert.deepEqual(seen, [1, 2]);
  });
});

test("a claim with broken JSON goes to the DLQ with event:error", async () => {
  await withTempDir(async (dir) => {
    const { paths, loop, notes } = await setup(dir);
    await writeFile(path.join(paths.claim, "abc.json"), "{oops");
    await loop.recoverClaims();
    assert.deepEqual(await names(paths.claim), []);
    assert.equal(
      await readFile(path.join(paths.dlq, "abc.json"), "utf8"),
      "{oops",
    );
    assert.equal(notes[0].name, "event:error");
  });
});

test("an error of the file system is not caught", async () => {
  await withTempDir(async (dir) => {
    const { paths, loop } = await setup(dir);
    await rm(paths.queue, {
      recursive: true,
    });
    await assert.rejects(loop.iterate(), {
      code: "ENOENT",
    });
  });
});
