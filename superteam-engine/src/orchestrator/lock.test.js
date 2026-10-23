import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { lockPath, releaseLock, takeLock } from "./lock.js";

let baseDir;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), "st-lock-"));
});

afterEach(() =>
  rm(baseDir, {
    recursive: true,
    force: true,
  }),
);

const holdBy = async (pid) => {
  await mkdir(path.dirname(lockPath(baseDir)), {
    recursive: true,
  });
  await writeFile(lockPath(baseDir), String(pid));
};

test("takes a free lock and writes its pid", async () => {
  await takeLock(baseDir, {
    pid: 100,
  });
  assert.equal(await readFile(lockPath(baseDir), "utf8"), "100");
});

test("refuses when a live superteam holds the lock", async () => {
  await holdBy(200);
  await assert.rejects(
    takeLock(baseDir, {
      pid: 100,
      isAlive: (pid) => pid === 200,
      commandOf: () => "node /plugin/src/orchestrator/main.js",
    }),
    /superteam is already running \(pid 200\)/,
  );
  assert.equal(await readFile(lockPath(baseDir), "utf8"), "200");
});

for (const [name, options] of [
  [
    "a pid that is gone",
    {
      isAlive: () => false,
      commandOf: () => assert.fail("must not read the command"),
    },
  ],
  [
    "a pid that runs another command",
    {
      isAlive: () => true,
      commandOf: () => "/usr/bin/vim notes.txt",
    },
  ],
]) {
  test(`replaces the lock of ${name}`, async () => {
    await holdBy(200);
    await takeLock(baseDir, {
      pid: 100,
      ...options,
    });
    assert.equal(await readFile(lockPath(baseDir), "utf8"), "100");
  });
}

test("release removes the lock only when it holds the pid", async () => {
  await holdBy(200);
  releaseLock(baseDir, 100);
  assert.equal(existsSync(lockPath(baseDir)), true);
  releaseLock(baseDir, 200);
  assert.equal(existsSync(lockPath(baseDir)), false);
});
