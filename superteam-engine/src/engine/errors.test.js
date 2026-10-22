import assert from "node:assert/strict";
import { test } from "node:test";
import { EngineError } from "./errors.js";

test("an EngineError is an Error with a code and a message", () => {
  const error = new EngineError("not-found", "no work w1");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "EngineError");
  assert.equal(error.code, "not-found");
  assert.equal(error.message, "no work w1");
});
