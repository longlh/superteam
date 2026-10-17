import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandlers } from "./handlers.js";

test("a handler is found by its type, and a type with no handler gives nothing", () => {
  const handlers = createHandlers();
  const handler = () => {};
  handlers.register("work:submit", handler);
  assert.equal(handlers.get("work:submit"), handler);
  assert.equal(handlers.get("work:approve"), undefined);
});

test("a second handler for the same type throws", () => {
  const handlers = createHandlers();
  handlers.register("a", () => {});
  assert.throws(
    () => handlers.register("a", () => {}),
    /already has a handler/,
  );
});

test("a handler that is not a function throws", () => {
  assert.throws(
    () => createHandlers().register("a", "text"),
    /must be a function/,
  );
});
