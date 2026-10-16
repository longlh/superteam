import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubscribers } from "./subscribers.js";

test("handlers are called in the order of the subscription", () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("write:done", (d) => calls.push(["a", d]));
  subscribers.subscribe("write:done", (d) => calls.push(["b", d]));
  subscribers.subscribe("write:error", (d) => calls.push(["c", d]));
  subscribers.emit("write:done", 1);
  assert.deepEqual(calls, [
    ["a", 1],
    ["b", 1],
  ]);
});

test("the function that subscribe returns unsubscribes the handler", () => {
  const subscribers = createSubscribers();
  const calls = [];
  const unsubscribe = subscribers.subscribe("write:done", () => calls.push(1));
  subscribers.subscribe("write:done", () => calls.push(2));
  unsubscribe();
  subscribers.emit("write:done", null);
  assert.deepEqual(calls, [2]);
});

test("a handler that throws does not stop the other handlers", () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("write:done", () => {
    throw new Error("sync");
  });
  subscribers.subscribe("write:done", () => calls.push("after sync"));
  subscribers.emit("write:done", null);
  assert.deepEqual(calls, ["after sync"]);
});

test("a handler that rejects is isolated, and is not awaited", async () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("write:done", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    calls.push("slow");
    throw new Error("async");
  });
  subscribers.subscribe("write:done", () => calls.push("fast"));
  subscribers.emit("write:done", null);
  assert.deepEqual(calls, ["fast"]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(calls, ["fast", "slow"]);
});

test("a handler can unsubscribe during an emit", () => {
  const subscribers = createSubscribers();
  const calls = [];
  const unsubscribe = subscribers.subscribe("write:done", () => {
    calls.push("a");
    unsubscribe();
  });
  subscribers.subscribe("write:done", () => calls.push("b"));
  subscribers.emit("write:done", null);
  subscribers.emit("write:done", null);
  assert.deepEqual(calls, ["a", "b", "b"]);
});
