import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearTmp, ensurePaths, getPaths } from "./paths.js";

test("the folders are under {baseDir}/.superteam/.e", () => {
  assert.deepEqual(getPaths("/base"), {
    queue: "/base/.superteam/.e/queue",
    claim: "/base/.superteam/.e/claim",
    dlq: "/base/.superteam/.e/dlq",
    tmp: "/base/.superteam/.e/tmp",
  });
});

test("ensurePaths creates the missing folders, and can run twice", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "engineloop-paths-"));
  const paths = getPaths(baseDir);
  await ensurePaths(paths);
  await ensurePaths(paths);
  const root = path.join(baseDir, ".superteam", ".e");
  assert.deepEqual((await readdir(root)).sort(), [
    "claim",
    "dlq",
    "queue",
    "tmp",
  ]);
});

test("clearTmp deletes what is left in the tmp folder", async () => {
  const paths = getPaths(await mkdtemp(path.join(tmpdir(), "engineloop-")));
  await ensurePaths(paths);
  await writeFile(path.join(paths.tmp, "a.tmp"), "x");
  await clearTmp(paths);
  assert.deepEqual(await readdir(paths.tmp), []);
});
