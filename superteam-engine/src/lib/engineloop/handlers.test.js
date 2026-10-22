import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandlers } from "./handlers.js";

test("a type has one handler", () => {
  const handlers = createHandlers();
  const handler = async () => {};
  handlers.handle("work:assign", handler);
  assert.equal(handlers.get("work:assign"), handler);
  assert.equal(handlers.get("other"), undefined);
});

test("a second handler for a type throws", () => {
  const handlers = createHandlers();
  handlers.handle("a", async () => {});
  assert.throws(() => handlers.handle("a", async () => {}), /already/);
});

test("a handler that is not a function throws", () => {
  const handlers = createHandlers();
  assert.throws(() => handlers.handle("a", "no"), TypeError);
  assert.throws(() => handlers.handle("", async () => {}), TypeError);
});
