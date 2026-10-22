import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubscribers } from "./subscribers.js";

test("emit calls the subscribers of a name in order", () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("a", (data) => calls.push(["one", data]));
  subscribers.subscribe("a", (data) => calls.push(["two", data]));
  subscribers.subscribe("b", () => calls.push(["other"]));
  subscribers.emit("a", 5);
  assert.deepEqual(calls, [
    ["one", 5],
    ["two", 5],
  ]);
});

test("the function that subscribe returns unsubscribes", () => {
  const subscribers = createSubscribers();
  const calls = [];
  const off = subscribers.subscribe("a", () => calls.push(1));
  subscribers.emit("a");
  off();
  subscribers.emit("a");
  assert.equal(calls.length, 1);
});

test("a throwing and a rejecting subscriber do not stop the others", async () => {
  const subscribers = createSubscribers();
  const calls = [];
  subscribers.subscribe("a", () => {
    throw new Error("boom");
  });
  subscribers.subscribe("a", () => Promise.reject(new Error("later")));
  subscribers.subscribe("a", () => calls.push("third"));
  subscribers.emit("a");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["third"]);
});

test("emit does not wait for a subscriber", () => {
  const subscribers = createSubscribers();
  let finished = false;
  subscribers.subscribe("a", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    finished = true;
  });
  subscribers.emit("a");
  assert.equal(finished, false);
});

test("a subscriber that is not a function throws", () => {
  assert.throws(() => createSubscribers().subscribe("a", 3), TypeError);
});
