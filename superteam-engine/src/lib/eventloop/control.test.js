import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createControl } from "./control.js";
import { getPaths } from "./paths.js";

const payload = { command: "write", target: "/a/b.txt", src: "hi" };

// The control with fakes for all its parts, and the folders on a temporary
// disk folder. `calls` records what happened. `iterations` is what each call of
// iterate() returns, then false.
async function setup({ iterations = [] } = {}) {
  const paths = getPaths(await mkdtemp(path.join(tmpdir(), "control-")));
  const calls = [];
  const hooks = {};
  const queue = {
    maxOrder: async () => 5,
    put: async (event) => calls.push(["put", event]),
  };
  const factory = {
    setCounter: (n) => calls.push(["setCounter", n]),
    create: (p) => ({ payload: p }),
  };
  const loop = {
    recover: async () => calls.push(["recover"]),
    iterate: async (options) => {
      calls.push(["iterate", options]);
      hooks.onIterate?.();
      return iterations.shift() ?? false;
    },
  };
  const sleep = async (ms) => {
    calls.push(["sleep", ms]);
    hooks.onSleep?.();
    // Yield to Node, so that timers and signals can run.
    await new Promise((resolve) => setImmediate(resolve));
  };
  const control = createControl({
    paths,
    queue,
    factory,
    loop,
    sleep,
    pollIntervalMs: 1000,
  });
  return { calls, control, hooks, paths };
}

const names = (calls) => calls.map((c) => c[0]);

test("start makes the folders, sets the counter, recovers, and checks the shutdown flag", async () => {
  const { calls, control, paths } = await setup();
  control.shutdown();
  await control.start({ handleSignals: false });
  assert.deepEqual(calls, [["setCounter", 5], ["recover"]]);
  for (const folder of Object.values(paths)) {
    assert.deepEqual(await readdir(folder), []);
  }
});

test("the loop passes fetchTimeoutMs to each iteration", async () => {
  const { calls, control, hooks } = await setup({ iterations: [true, true] });
  hooks.onSleep = () => control.shutdown();
  await control.start({ fetchTimeoutMs: 50, handleSignals: false });
  assert.deepEqual(
    calls.filter((c) => c[0] === "iterate"),
    [
      ["iterate", { fetchTimeoutMs: 50 }],
      ["iterate", { fetchTimeoutMs: 50 }],
      ["iterate", { fetchTimeoutMs: 50 }],
    ],
  );
});

test("the loop waits pollIntervalMs only when the queue is empty", async () => {
  const { calls, control, hooks } = await setup({ iterations: [true, true] });
  hooks.onSleep = () => control.shutdown();
  await control.start({ handleSignals: false });
  // Two iterations with an event do not wait, the third one finds it empty.
  assert.deepEqual(names(calls).slice(2), [
    "iterate",
    "iterate",
    "iterate",
    "sleep",
  ]);
  assert.deepEqual(calls.at(-1), ["sleep", 1000]);
});

test("a shutdown during an iteration finishes it and starts no new one", async () => {
  const { calls, control, hooks } = await setup({ iterations: [true, true] });
  hooks.onIterate = () => control.shutdown();
  await control.start({ handleSignals: false });
  assert.equal(calls.filter((c) => c[0] === "iterate").length, 1);
  assert.ok(!names(calls).includes("sleep"));
});

test("enqueue before start rejects, and after the start stage it writes the event", async () => {
  const { calls, control } = await setup();
  await assert.rejects(control.enqueue(payload), /start\(\) first/);
  control.shutdown(); // only the start stage runs
  await control.start({ handleSignals: false });
  const event = await control.enqueue(payload);
  assert.deepEqual(event, { payload });
  assert.deepEqual(calls.at(-1), ["put", event]);
});

test("enqueue works while the loop runs", async () => {
  const { control, hooks } = await setup();
  let event;
  hooks.onSleep = async () => {
    event = await control.enqueue(payload);
    control.shutdown();
  };
  await control.start({ handleSignals: false });
  assert.deepEqual(event, { payload });
});

test("SIGTERM and SIGINT shut the loop down, and the handlers are removed", async () => {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    const { control } = await setup();
    const before = process.listenerCount(signal);
    // Emitting the event on `process` runs the handlers without a real signal.
    setTimeout(() => {
      assert.equal(process.listenerCount(signal), before + 1);
      process.emit(signal);
    }, 20);
    await control.start();
    assert.equal(process.listenerCount(signal), before);
  }
});

test("handleSignals false adds no handler", async () => {
  const { control, hooks } = await setup();
  const before = process.listenerCount("SIGTERM");
  hooks.onSleep = () => {
    assert.equal(process.listenerCount("SIGTERM"), before);
    control.shutdown();
  };
  await control.start({ handleSignals: false });
});

test("the handlers are removed when the start stage fails", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "control-"));
  await writeFile(path.join(dir, ".superteam"), "a file, not a folder");
  const failing = createControl({
    paths: getPaths(dir),
    queue: {},
    factory: {},
    loop: {},
    sleep: async () => {},
  });
  const before = process.listenerCount("SIGTERM");
  await assert.rejects(failing.start());
  assert.equal(process.listenerCount("SIGTERM"), before);
  await assert.rejects(failing.enqueue(payload), /start\(\) first/);
});
