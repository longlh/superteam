import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pidFilePath, removeOwnPidFile } from "./pid-file.js";

let baseDir;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "pid-file-"));
  await mkdir(path.dirname(pidFilePath(baseDir)), {
    recursive: true,
  });
});

afterEach(() =>
  rm(baseDir, {
    recursive: true,
    force: true,
  }),
);

test("removeOwnPidFile removes the file that holds the pid", async () => {
  await writeFile(pidFilePath(baseDir), "4242");
  removeOwnPidFile(baseDir, 4242);
  assert.equal(existsSync(pidFilePath(baseDir)), false);
});

test("removeOwnPidFile keeps the file of another pid, and a missing file is fine", async () => {
  await writeFile(pidFilePath(baseDir), "4243");
  removeOwnPidFile(baseDir, 4242);
  assert.equal(existsSync(pidFilePath(baseDir)), true);
  await rm(pidFilePath(baseDir));
  removeOwnPidFile(baseDir, 4242);
});
