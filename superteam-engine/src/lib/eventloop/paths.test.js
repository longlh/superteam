import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensurePaths, getPaths } from "./paths.js";

test("the folders are under {baseDir}/.superteam/.w", () => {
  const paths = getPaths("/base");
  assert.deepEqual(paths, {
    queue: "/base/.superteam/.w/queue",
    claim: "/base/.superteam/.w/claim",
    dlq: "/base/.superteam/.w/dlq",
    tmp: "/base/.superteam/.w/tmp",
  });
});

test("ensurePaths creates the missing folders, and can run twice", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "paths-"));
  const paths = getPaths(baseDir);
  await ensurePaths(paths);
  await ensurePaths(paths);
  const root = path.join(baseDir, ".superteam", ".w");
  assert.deepEqual((await readdir(root)).sort(), [
    "claim",
    "dlq",
    "queue",
    "tmp",
  ]);
});
