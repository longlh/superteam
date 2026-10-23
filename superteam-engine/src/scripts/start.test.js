import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pingReady, startSuperteam } from "./start.js";

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
const logFile = (dir) => path.join(dir, ".superteam/.r/superteam.log");

// The defaults of a test: the new process answers at once, and no pid is
// alive but its own.
const start = (dir, options = {}) =>
  startSuperteam({
    baseDir: dir,
    spawn: fakeSpawn([]),
    isAlive: (pid) => pid === 4321,
    commandOf: () => assert.fail("must not read the command"),
    ping: async () => 4321,
    sleep: async () => {},
    ...options,
  });

test("spawns main.js detached and writes the pid file", () =>
  withDir(async (dir) => {
    const calls = [];
    const result = await start(dir, {
      spawn: fakeSpawn(calls),
    });
    assert.deepEqual(result, {
      pid: 4321,
      port: "4010",
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

test("refuses when the pid of the pid file answers on the port", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    const calls = [];
    await assert.rejects(
      start(dir, {
        spawn: fakeSpawn(calls),
        isAlive: (pid) => pid === 777,
        ping: async () => 777,
      }),
      /already running.*777/,
    );
    assert.deepEqual(calls, []);
  }));

test("refuses when the pid of the pid file runs main.js but does not answer", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    const calls = [];
    await assert.rejects(
      start(dir, {
        spawn: fakeSpawn(calls),
        isAlive: (pid) => pid === 777,
        ping: async () => null,
        commandOf: () => `node ${main}`,
      }),
      /pid 777\) is starting, or does not answer on the port 4010: read \.superteam\/\.r\/superteam\.log/,
    );
    assert.deepEqual(calls, []);
    assert.equal(await readFile(pidFile(dir), "utf8"), "777");
  }));

test("replaces a pid file whose live pid runs another command", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    let pings = 0;
    const result = await start(dir, {
      isAlive: (pid) => pid === 777 || pid === 4321,
      ping: async () => {
        pings += 1;
        return pings > 1 ? 4321 : null;
      },
      commandOf: () => "/usr/bin/other",
    });
    assert.equal(result.pid, 4321);
    assert.equal(await readFile(pidFile(dir), "utf8"), "4321");
  }));

test("replaces a pid file whose pid is gone", () =>
  withDir(async (dir) => {
    await writeFile(pidFile(dir), "777");
    const result = await start(dir);
    assert.equal(result.pid, 4321);
    assert.equal(await readFile(pidFile(dir), "utf8"), "4321");
  }));

test("waits until the new process answers", () =>
  withDir(async (dir) => {
    let pings = 0;
    const waits = [];
    const result = await start(dir, {
      ping: async () => {
        pings += 1;
        return pings === 3 ? 4321 : null;
      },
      sleep: async (ms) => waits.push(ms),
    });
    assert.equal(result.pid, 4321);
    assert.deepEqual(waits, [200, 200]);
  }));

test("fails with the end of the log when the process exits during its start", () =>
  withDir(async (dir) => {
    await writeFile(
      logFile(dir),
      `${Array.from(
        {
          length: 25,
        },
        (_, i) => `line ${i + 1}`,
      ).join("\n")}\n`,
    );
    await assert.rejects(
      start(dir, {
        ping: async () => null,
        isAlive: () => false,
      }),
      (error) => {
        const lines = error.message.split("\n");
        assert.equal(lines[0], "superteam exited during its start:");
        assert.deepEqual(lines.slice(1), [
          ...Array.from(
            {
              length: 20,
            },
            (_, i) => `line ${i + 6}`,
          ),
        ]);
        return true;
      },
    );
  }));

test("fails and says to read the log when the process does not answer in time", () =>
  withDir(async (dir) => {
    await assert.rejects(
      start(dir, {
        ping: async () => null,
        timeoutMs: 1000,
      }),
      /does not answer on the port 4010 after 1 s: read \.superteam\/\.r\/superteam\.log/,
    );
  }));

test("does not take the answer of another server on the port for its own", () =>
  withDir(async (dir) => {
    let checks = 0;
    await assert.rejects(
      start(dir, {
        ping: async () => 999,
        isAlive: () => {
          checks += 1;
          return checks < 3;
        },
      }),
      /superteam exited during its start/,
    );
  }));

test("pingReady is false when nothing listens on the port", async () => {
  assert.equal(await pingReady(1), null);
});

for (const content of ["", "0", "-1", "abc"]) {
  test(`treats the pid file ${JSON.stringify(content)} as stale`, () =>
    withDir(async (dir) => {
      await writeFile(pidFile(dir), content);
      const result = await start(dir, {
        isAlive: (pid) =>
          pid === 4321 ? true : assert.fail("must not probe the old pid"),
      });
      assert.equal(result.pid, 4321);
      assert.equal(await readFile(pidFile(dir), "utf8"), "4321");
    }));
}
