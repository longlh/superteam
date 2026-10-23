import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createEngineLoop } from "./index.js";
import { createClock, createSleep, waitFor, withTempDir } from "./testkit.js";

function engine(dir, options = {}) {
  return createEngineLoop({
    baseDir: dir,
    sleep: createSleep(),
    now: createClock(),
    ...options,
  });
}

async function started(loop) {
  const ready = new Promise((resolve) => loop.subscribe("loop:ready", resolve));
  const running = loop.start();
  await ready;
  return {
    running,
  };
}

test("the API has handle, enqueue, requeue, subscribe, start and shutdown", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    assert.deepEqual(Object.keys(loop).sort(), [
      "enqueue",
      "handle",
      "requeue",
      "shutdown",
      "start",
      "subscribe",
    ]);
  });
});

test("a failing event is tried 6 times by default, then goes to the DLQ as retryable", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    let calls = 0;
    loop.handle("t", async () => {
      calls += 1;
      throw new Error("offline");
    });
    const errors = [];
    loop.subscribe("event:error", (data) => errors.push(data));
    const { running } = await started(loop);
    await loop.enqueue({
      type: "t",
      data: {},
    });
    await waitFor(() => errors.length === 1, "event:error");
    loop.shutdown();
    await running;
    assert.equal(calls, 6);
    assert.equal(errors[0].retryable, true);
    assert.equal(
      path.dirname(errors[0].file),
      path.join(dir, ".superteam", ".r", "engineloop", "dlq"),
    );
  });
});

test("an error with retryable false goes to the DLQ at once, as not retryable", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    loop.handle("t", async () => {
      throw Object.assign(new Error("bad data"), {
        retryable: false,
      });
    });
    const errors = [];
    loop.subscribe("event:error", (data) => errors.push(data));
    const { running } = await started(loop);
    await loop.enqueue({
      type: "t",
      data: {},
    });
    await waitFor(() => errors.length === 1, "event:error");
    loop.shutdown();
    await running;
    assert.equal(errors[0].retryable, false);
  });
});

test("requeue puts an event of the DLQ back in the queue, with attempts 0", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    let fail = true;
    loop.handle("t", async () => {
      if (fail) {
        throw Object.assign(new Error("refused"), {
          retryable: false,
        });
      }
    });
    const errors = [];
    const done = [];
    loop.subscribe("event:error", (data) => errors.push(data));
    loop.subscribe("event:done", (data) => done.push(data));
    const { running } = await started(loop);
    await loop.enqueue({
      type: "t",
      data: {
        n: 1,
      },
    });
    await waitFor(() => errors.length === 1, "event:error");
    fail = false;
    const event = await loop.requeue(errors[0].file);
    assert.equal(event.attempts, 0);
    assert.deepEqual(event.errors, []);
    await waitFor(() => done.length === 1, "event:done");
    loop.shutdown();
    await running;
    assert.deepEqual(done[0].event.payload, {
      type: "t",
      data: {
        n: 1,
      },
    });
    assert.deepEqual(
      await readdir(path.join(dir, ".superteam", ".r", "engineloop", "dlq")),
      [],
    );
  });
});

test("events are processed one at a time, in order", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    const log = [];
    let active = 0;
    let maxActive = 0;
    loop.handle("t", async (event) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(event.payload.data.n);
      active -= 1;
    });
    const { running } = await started(loop);
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        loop.enqueue({
          type: "t",
          data: {
            n,
          },
        }),
      ),
    );
    await waitFor(() => log.length === 5, "five events");
    loop.shutdown();
    await running;
    assert.equal(maxActive, 1);
    assert.deepEqual(log, [1, 2, 3, 4, 5]);
  });
});

test("enqueue before start is rejected, and it resolves with the event", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    await assert.rejects(
      loop.enqueue({
        type: "t",
        data: {},
      }),
    );
    const { running } = await started(loop);
    const event = await loop.enqueue({
      type: "t",
      data: {},
    });
    assert.equal(event.attempts, 0);
    assert.equal(event.payload.type, "t");
    loop.shutdown();
    await running;
  });
});

test("an invalid payload is refused by enqueue", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    const { running } = await started(loop);
    await assert.rejects(
      loop.enqueue({
        type: "t",
        data: 3,
      }),
      /data/,
    );
    loop.shutdown();
    await running;
  });
});

test("a handler can enqueue events, and subscribers see event:done", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    const done = [];
    loop.subscribe("event:done", ({ event }) => done.push(event.payload.type));
    loop.handle("first", async () => {
      await loop.enqueue({
        type: "second",
        data: {},
      });
    });
    loop.handle("second", async () => {});
    const { running } = await started(loop);
    await loop.enqueue({
      type: "first",
      data: {},
    });
    await waitFor(() => done.length === 2, "two events");
    loop.shutdown();
    await running;
    assert.deepEqual(done, ["first", "second"]);
  });
});

test("after a crash the event is processed again by a new loop", async () => {
  await withTempDir(async (dir) => {
    const first = engine(dir);
    let release;
    const stuck = new Promise((resolve) => {
      release = resolve;
    });
    let entered = false;
    first.handle("t", async () => {
      entered = true;
      await stuck;
    });
    // The first loop never finishes its iteration: it is a crash.
    const { running: crashed } = await started(first);
    crashed.catch(() => {});
    await first.enqueue({
      type: "t",
      data: {
        n: 1,
      },
    });
    await waitFor(() => entered, "the handler");
    assert.equal(
      (await readdir(path.join(dir, ".superteam/.r/engineloop/claim"))).length,
      1,
    );

    const second = engine(dir);
    const seen = [];
    second.handle("t", async (event) => seen.push(event));
    const { running } = await started(second);
    await waitFor(() => seen.length === 1, "the second loop");
    assert.equal(seen[0].payload.data.n, 1);
    second.shutdown();
    await running;
    first.shutdown();
    release();
    await crashed;
  });
});

test("an error of the file system rejects start()", async () => {
  await withTempDir(async (dir) => {
    const loop = engine(dir);
    const { running } = await started(loop);
    const outcome = assert.rejects(running, {
      code: "ENOENT",
    });
    await rm(path.join(dir, ".superteam/.r/engineloop/queue"), {
      recursive: true,
    });
    await outcome;
  });
});
