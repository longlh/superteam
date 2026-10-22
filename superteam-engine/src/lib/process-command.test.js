import assert from "node:assert/strict";
import { test } from "node:test";
import { processCommand } from "./process-command.js";

test("gives the command of a live process, and null for a pid that is gone", () => {
  assert.match(processCommand(process.pid), /node/);
  assert.equal(processCommand(2 ** 22 + 12345), null);
});
