import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startSuperteam } from "./start.js";

const main = fileURLToPath(new URL("../orchestrator/main.js", import.meta.url));

async function withDir(fn, { env = "SUPERTEAM_PORT=4010\n" } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st-start-"));
  try {
    await mkdir(path.join(dir, ".superteam/.r"), {
      recursive: true,
    });
    if (env !== null) {
      await writeFile(path.join(dir, ".superteam/.env"), env);
    }
    await fn(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

function fakeSpawn(calls) {
  return (command, args, options) => {
    calls.push({
      command,
      args,
      options,
    });
    return {
      pid: 4321,
      unref() {
        calls.push("unref");
      },
    };
  };
}

const pidFile = (dir) => path.join(dir, ".superteam/.r/superteam.pid");

test("spawns main.js detached and writes the pid file", () =>
  withDir(async (dir) => {
    const calls = [];
    const result = await startSuperteam({
      baseDir: dir,
      spawn: fakeSpawn(calls),
      isAlive: () => false,
    });
    assert.deepEqual(result, {
      pid: 4321,
    });
    const [call, unref] = calls;
    assert.equal(call.command, process.execPath);
    assert.deepEqual(call.args, [main]);
    assert.equal(call.options.cwd, dir);
    assert.equal(call.options.detached, true);
    assert.equal(typeof call.options.stdio[1], "number");
    assert.equal(call.options.stdio[2], call.options.stdio[1]);
    assert.equal(unref, "unref");
    assert.equal(await readFile(pidFile(dir), "utf8"), "4321");
    await readFile(path.join(dir, ".superteam/.r/superteam.log"), "utf8");
  }));

test("refuses when SUPERTEAM_PORT is missing", () =>
  withDir(
    async (dir) => {
      await assert.rejects(
        startSuperteam({
          baseDir: dir,
          spawn: fakeSpawn([]),
          isAlive: () => false,
        }),
        /SUPERTEAM_PORT/,
      );
    },
    {
      env: "OTHER=1\n",
    },
  ));

test("refuses when .env is missing", () =>
  withDir(
    async (dir) => {
      await assert.rejects(
        startSuperteam({
          baseDir: dir,
          spawn: fakeSpawn([]),
          isAlive: () => false,
        }),
        /SUPERTEAM_PORT/,
      );
    },
    {
      env: null,
    },
  ));

test("refuses when the pid file holds a live pid", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    const calls = [];
    await assert.rejects(
      startSuperteam({
        baseDir: dir,
        spawn: fakeSpawn(calls),
        isAlive: (pid) => pid === 777,
      }),
      /already running.*777/,
    );
    assert.deepEqual(calls, []);
  }));

test("replaces a stale pid file", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    const result = await startSuperteam({
      baseDir: dir,
      spawn: fakeSpawn([]),
      isAlive: () => false,
    });
    assert.equal(result.pid, 4321);
    assert.equal(await readFile(pidFile(dir), "utf8"), "4321");
  }));
