import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubscribers } from "./subscribers.js";

test("handlers are called in the order of the subscription", () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("a", () => calls.push(1));
  subscribers.subscribe("a", () => calls.push(2));
  subscribers.subscribe("b", () => calls.push(3));
  subscribers.emit("a", {});
  assert.deepEqual(calls, [1, 2]);
});

test("the function that subscribe returns unsubscribes the handler", () => {
  const subscribers = createSubscribers();
  const calls = [];
  const off = subscribers.subscribe("a", () => calls.push(1));
  off();
  subscribers.emit("a", {});
  assert.deepEqual(calls, []);
});

test("a handler that throws or rejects does not stop the other handlers", async () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("a", () => {
    throw new Error("boom");
  });
  subscribers.subscribe("a", async () => {
    throw new Error("rejected");
  });
  subscribers.subscribe("a", () => calls.push("third"));
  subscribers.emit("a", {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["third"]);
});

test("a handler can unsubscribe during an emit", () => {
  const subscribers = createSubscribers();
  const calls = [];
  const off = subscribers.subscribe("a", () => {
    calls.push(1);
    off();
  });
  subscribers.subscribe("a", () => calls.push(2));
  subscribers.emit("a", {});
  subscribers.emit("a", {});
  assert.deepEqual(calls, [1, 2, 2]);
});
