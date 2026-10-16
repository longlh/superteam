import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoop } from "./loop.js";
import { eventId } from "./event.js";

const payload = { command: "write", target: "/a/b.txt", src: "hi" };
const createdAt = "2026-01-01T00:00:00.000Z";
const makeEvent = (attempts = 0) => ({
  order: 1,
  id: eventId(createdAt, 1),
  payload,
  createdAt,
  attempts,
});

// The loop with fakes for all its parts. `calls` records what happened.
function setup({ claims = [], next = null, writeError, maxAttempts = 3 } = {}) {
  const calls = [];
  const queue = {
    listClaims: async () => claims,
    readClaim: async () => JSON.stringify(makeEvent(2)),
    claimNext: async () => {
      calls.push(["claimNext"]);
      return next && { name: "claimed", raw: JSON.stringify(next) };
    },
    deleteClaim: async (name) => calls.push(["deleteClaim", name]),
    toDlq: async (name) => calls.push(["toDlq", name]),
    maxOrder: async () => 5,
  };
  const factory = {
    setCounter: (n) => calls.push(["setCounter", n]),
    create: (p, options) => ({ payload: p, ...options }),
    enqueue: async (event) => calls.push(["enqueue", event]),
  };
  const writer = {
    write: async () => {
      calls.push(["write"]);
      if (writeError) throw writeError;
      return "the-hash";
    },
  };
  const subscribers = {
    emit: (name, data) => calls.push(["emit", name, data]),
  };
  const hooks = {};
  const sleep = async (ms) => {
    calls.push(["sleep", ms]);
    hooks.onSleep?.();
  };
  const now = () => new Date(createdAt);
  const loop = createLoop({
    queue,
    factory,
    writer,
    subscribers,
    maxAttempts,
    sleep,
    now,
    pollIntervalMs: 1000,
  });
  return { calls, loop, writer, hooks };
}

const names = (calls) => calls.map((c) => c[0]);

test("an empty queue ends the iteration with false", async () => {
  const { calls, loop } = setup();
  assert.equal(await loop.iterate(), false);
  assert.deepEqual(names(calls), ["claimNext"]);
});

test("a write that succeeds deletes the claim and fires write:done", async () => {
  const event = makeEvent();
  const { calls, loop } = setup({ next: event });
  assert.equal(await loop.iterate(), true);
  assert.deepEqual(calls.slice(1), [
    ["write"],
    ["deleteClaim", "claimed"],
    ["emit", "write:done", { event, hash: "the-hash", time: createdAt }],
  ]);
});

test("an abandoned claim goes to the DLQ before a new claim", async () => {
  const { calls, loop } = setup({ claims: ["old"] });
  await loop.iterate();
  assert.deepEqual(calls.slice(0, 2), [["toDlq", "old"], ["claimNext"]]);
});

test("a retry waits 2^attempts seconds, a first try does not wait", async () => {
  for (const [attempts, waits] of [
    [0, []],
    [1, [["sleep", 2000]]],
    [2, [["sleep", 4000]]],
  ]) {
    const { calls, loop } = setup({ next: makeEvent(attempts) });
    await loop.iterate();
    assert.deepEqual(
      calls.filter((c) => c[0] === "sleep"),
      waits,
    );
  }
});

test("a failed write is enqueued again at order 0 with attempts plus one", async () => {
  const event = makeEvent(1);
  const { calls, loop } = setup({ next: event, writeError: new Error("boom") });
  await loop.iterate();
  assert.deepEqual(calls.slice(-3), [
    ["enqueue", { payload, order: 0, attempts: 2 }],
    ["deleteClaim", "claimed"],
    ["emit", "write:retry", { event, error: "boom" }],
  ]);
});

test("when attempts reaches the maximum the event goes to the DLQ", async () => {
  const event = makeEvent(2);
  const { calls, loop } = setup({ next: event, writeError: new Error("boom") });
  await loop.iterate();
  assert.deepEqual(calls.slice(-2), [
    ["toDlq", "claimed"],
    ["emit", "write:error", { event, error: "boom" }],
  ]);
  assert.ok(!names(calls).includes("enqueue"));
});

test("an event with a wrong structure goes to the DLQ without a retry", async () => {
  const { calls, loop } = setup({ next: { nope: true } });
  await loop.iterate();
  assert.deepEqual(names(calls), ["claimNext", "toDlq", "emit"]);
  assert.equal(calls[2][1], "write:error");
  assert.deepEqual(calls[2][2].event, { nope: true });
});

test("prepare sets the counter and recovers a claim, and run checks the shutdown flag", async () => {
  const { calls, loop } = setup({ claims: ["crashed"] });
  loop.shutdown();
  await loop.prepare();
  await loop.run();
  assert.deepEqual(calls, [
    ["setCounter", 5],
    ["enqueue", { payload, order: 0, attempts: 2 }],
    ["deleteClaim", "crashed"],
  ]);
});

test("a shutdown during an iteration finishes it and starts no new one", async () => {
  const { calls, loop, writer } = setup({ next: makeEvent() });
  const write = writer.write;
  writer.write = async (...args) => {
    loop.shutdown();
    return write(...args);
  };
  await loop.run();
  assert.equal(calls.filter((c) => c[0] === "claimNext").length, 1);
  assert.ok(names(calls).includes("deleteClaim"));
});

test("the loop waits pollIntervalMs when the queue is empty", async () => {
  const { calls, loop, hooks } = setup();
  hooks.onSleep = () => loop.shutdown();
  await loop.run();
  assert.deepEqual(
    calls.filter((c) => c[0] === "sleep"),
    [["sleep", 1000]],
  );
});
