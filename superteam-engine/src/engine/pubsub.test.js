import assert from "node:assert/strict";
import { test } from "node:test";
import { createPubSub } from "./pubsub.js";

test("publish reaches the subscribers of the topic only, in order", () => {
  const pubsub = createPubSub();
  const log = [];
  pubsub.subscribe("job:run", (data) => log.push(["first", data]));
  pubsub.subscribe("job:stop", (data) => log.push(["other", data]));
  pubsub.subscribe("job:run", (data) => log.push(["second", data]));
  pubsub.publish("job:run", 1);
  assert.deepEqual(log, [
    ["first", 1],
    ["second", 1],
  ]);
});

test("an unsubscribed subscriber is not called", () => {
  const pubsub = createPubSub();
  const log = [];
  const unsubscribe = pubsub.subscribe("job:run", () => log.push("gone"));
  pubsub.subscribe("job:run", () => log.push("kept"));
  unsubscribe();
  pubsub.publish("job:run");
  assert.deepEqual(log, ["kept"]);
});

test("a throwing or rejecting subscriber does not stop the others", async () => {
  const pubsub = createPubSub();
  const log = [];
  pubsub.subscribe("job:run", () => {
    throw new Error("boom");
  });
  pubsub.subscribe("job:run", () => Promise.reject(new Error("later")));
  pubsub.subscribe("job:run", () => log.push("called"));
  pubsub.publish("job:run");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, ["called"]);
});
