import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createPaths } from "./paths.js";

test("the folders are under .superteam/.r/engineloop", () => {
  const paths = createPaths("/work");
  const root = path.join("/work", ".superteam", ".r", "engineloop");
  assert.deepEqual(paths, {
    root,
    queue: path.join(root, "queue"),
    claim: path.join(root, "claim"),
    dlq: path.join(root, "dlq"),
    tmp: path.join(root, "tmp"),
  });
});
