import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { stopSuperteam } from "./stop.js";

async function withDir(fn, { pid } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st-stop-"));
  try {
    await mkdir(path.join(dir, ".superteam/.r"), {
      recursive: true,
    });
    if (pid !== undefined) {
      await writeFile(pidFile(dir), String(pid));
    }
    await fn(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

const pidFile = (dir) => path.join(dir, ".superteam/.r/superteam.pid");
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

test("sends SIGTERM to a live pid and deletes the pid file", () =>
  withDir(
    async (dir) => {
      const sent = [];
      const result = await stopSuperteam({
        baseDir: dir,
        kill: (pid, signal) => sent.push([pid, signal]),
        isAlive: () => true,
      });
      assert.deepEqual(result, {
        stopped: true,
      });
      assert.deepEqual(sent, [[555, "SIGTERM"]]);
      assert.equal(await exists(pidFile(dir)), false);
    },
    {
      pid: 555,
    },
  ));

test("returns stopped false without a pid file", () =>
  withDir(async (dir) => {
    const result = await stopSuperteam({
      baseDir: dir,
      kill: () => assert.fail("must not kill"),
      isAlive: () => true,
    });
    assert.deepEqual(result, {
      stopped: false,
    });
  }));

test("deletes a stale pid file without killing", () =>
  withDir(
    async (dir) => {
      const result = await stopSuperteam({
        baseDir: dir,
        kill: () => assert.fail("must not kill"),
        isAlive: () => false,
      });
      assert.deepEqual(result, {
        stopped: false,
      });
      assert.equal(await exists(pidFile(dir)), false);
    },
    {
      pid: 555,
    },
  ));
