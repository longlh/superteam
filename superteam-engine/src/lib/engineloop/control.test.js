import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createControl } from "./control.js";
import { createFactory } from "./factory.js";
import { createHandlers } from "./handlers.js";
import { createLoop } from "./loop.js";
import { createPaths } from "./paths.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";
import { createClock, createSleep, waitFor, withTempDir } from "./testkit.js";

function setup(dir) {
  const paths = createPaths(dir);
  const queue = createQueue(paths);
  const now = createClock();
  const factory = createFactory({
    queue,
    now,
  });
  const handlers = createHandlers();
  const subscribers = createSubscribers();
  const loop = createLoop({
    queue,
    factory,
    handlers,
    subscribers,
    maxAttempts: 3,
    pollIntervalMs: 1000,
    sleep: createSleep(),
    now,
  });
  const control = createControl({
    queue,
    factory,
    handlers,
    loop,
    subscribers,
  });
  return {
    paths,
    queue,
    factory,
    subscribers,
    control,
  };
}

const payload = {
  type: "t",
  data: {},
};

test("enqueue before the start stage is rejected", async () => {
  await withTempDir(async (dir) => {
    const { control } = setup(dir);
    await assert.rejects(control.enqueue(payload), /start stage/);
  });
});

test("start twice rejects, and handle after start throws", async () => {
  await withTempDir(async (dir) => {
    const { control } = setup(dir);
    const running = control.start();
    await assert.rejects(control.start(), /only once/);
    assert.throws(() => control.handle("t", async () => {}), /before start/);
    control.shutdown();
    await running;
  });
});

test("the start stage: folders, tmp, counter, claims, then loop:ready", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue, factory, subscribers, control } = setup(dir);
    await queue.ensureFolders();
    await writeFile(path.join(paths.tmp, "half.json"), "{");
    await factory.create(payload);
    await factory.create(payload);
    await queue.claimNext();
    // 000001 is claimed (a crash), 000002 waits.
    const order = [];
    subscribers.subscribe("loop:ready", async (data) => {
      order.push(data);
      assert.deepEqual(await readdir(paths.tmp), []);
      assert.deepEqual(await readdir(paths.claim), []);
      assert.deepEqual(await readdir(paths.queue), [
        "000000.json",
        "000002.json",
      ]);
    });
    control.handle("t", async () => {});
    const running = control.start();
    await waitFor(() => order.length === 1, "loop:ready");
    assert.deepEqual(order, [undefined]);
    // The counter was set from the queue: the next order is 3.
    assert.equal((await control.enqueue(payload)).order, 3);
    control.shutdown();
    await running;
  });
});

test("shutdown finishes the iteration in progress, then start resolves", async () => {
  await withTempDir(async (dir) => {
    const { paths, subscribers, control } = setup(dir);
    const ready = new Promise((resolve) =>
      subscribers.subscribe("loop:ready", resolve),
    );
    const seen = [];
    let entered = false;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    control.handle("t", async (event) => {
      entered = true;
      await gate;
      seen.push(event.payload.data.n);
    });
    const running = control.start();
    await ready;
    await control.enqueue({
      type: "t",
      data: {
        n: 1,
      },
    });
    await control.enqueue({
      type: "t",
      data: {
        n: 2,
      },
    });
    await waitFor(() => entered, "the handler");
    control.shutdown();
    release();
    await running;
    assert.deepEqual(seen, [1]);
    assert.deepEqual(await readdir(paths.queue), ["000002.json"]);
    assert.deepEqual(await readdir(paths.claim), []);
  });
});

test("the loop installs no signal handler", async () => {
  await withTempDir(async (dir) => {
    const { control } = setup(dir);
    const before = ["SIGINT", "SIGTERM"].map((s) => process.listenerCount(s));
    const running = control.start();
    await waitFor(async () => {
      try {
        await control.enqueue(payload);
        return true;
      } catch {
        return false;
      }
    });
    const during = ["SIGINT", "SIGTERM"].map((s) => process.listenerCount(s));
    control.shutdown();
    await running;
    assert.deepEqual(during, before);
  });
});
