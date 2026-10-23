import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { agentsDir } from "../lib/storage/paths.js";
import { readJson, writeJson } from "../lib/storage/files.js";
import { createAgentManager } from "./agent-manager.js";

const fake = fileURLToPath(
  new URL("../../../test/fixtures/fake-claude.js", import.meta.url),
);

let baseDir;
let managers;
let strays;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "agents-"));
  await putRole("developer", "Bash, Read, Write, Edit, StructuredOutput");
  managers = [];
  strays = [];
});

afterEach(async () => {
  for (const manager of managers) {
    await manager.stopAll();
  }
  for (const child of strays) {
    kill(child.pid);
  }
  await rm(baseDir, {
    recursive: true,
    force: true,
  });
});

// The agent file of a role in the project of the test (the workdir of a job).
async function putRole(role, toolsLine) {
  const dir = path.join(baseDir, ".claude", "agents");
  await mkdir(dir, {
    recursive: true,
  });
  await writeFile(
    path.join(dir, `${role}.md`),
    `---\nname: ${role}\n${toolsLine === null ? "" : `tools: ${toolsLine}\n`}---\n\nYou are the ${role}.\n`,
  );
}

function kill(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("until: timed out");
}

function make(mode, options = {}) {
  const manager = createAgentManager({
    baseDir,
    command: fake,
    env: {
      FAKE_CLAUDE_MODE: mode,
    },
    ...options,
  });
  managers.push(manager);
  return manager;
}

function job(id = "w1/t1/worker", extra = {}) {
  return {
    id,
    role: "developer",
    timeout: 5,
    workdir: baseDir,
    schema: {
      type: "object",
    },
    instruction: {
      target: "task",
      targetIds: ["t1"],
      prompt: "go",
    },
    ...extra,
  };
}

const pidFiles = async () =>
  (await readdir(agentsDir(baseDir)).catch(() => [])).filter((n) =>
    n.endsWith(".pid"),
  );

function ended() {
  const results = [];
  return {
    results,
    onEnded: (result) => {
      results.push(result);
    },
  };
}

describe("agent manager run", () => {
  it("calls onEnded with the result and removes the pid file after", async () => {
    const manager = make("ok");
    const seen = ended();
    let during;
    await manager.run(job(), async (result) => {
      during = await pidFiles();
      seen.onEnded(result);
    });
    await until(() => seen.results.length === 1);
    assert.deepEqual(seen.results[0], {
      id: "w1/t1/worker",
      summary: "done",
      data: {
        dodChecklist: [],
      },
    });
    assert.equal(during.length, 1);
    await until(async () => (await pidFiles()).length === 0);
  });

  it("allows the tools of the agent file of the role", async () => {
    const argsFile = path.join(baseDir, "args.json");
    const manager = make("ok", {
      env: {
        FAKE_CLAUDE_MODE: "ok",
        FAKE_CLAUDE_ARGS_FILE: argsFile,
      },
    });
    const seen = ended();
    await manager.run(job(), seen.onEnded);
    await until(() => seen.results.length === 1);
    const args = await readJson(argsFile);
    const at = args.indexOf("--allowedTools");
    assert.ok(at > args.indexOf("--permission-mode"));
    assert.equal(args[at + 1], "Bash,Read,Write,Edit,StructuredOutput");
  });

  it("ends with an error, with no spawn and no pid file, when the file has no tools line", async () => {
    await putRole("developer", null);
    const argsFile = path.join(baseDir, "args.json");
    const manager = make("ok", {
      env: {
        FAKE_CLAUDE_MODE: "ok",
        FAKE_CLAUDE_ARGS_FILE: argsFile,
      },
    });
    const seen = ended();
    await manager.run(job(), seen.onEnded);
    assert.deepEqual(seen.results, [
      {
        id: "w1/t1/worker",
        error:
          "the agent file of the role developer has no tools line: under dontAsk the agent would get no tool",
      },
    ]);
    assert.deepEqual(await pidFiles(), []);
    await assert.rejects(readFile(argsFile));
  });

  it("ends with an error, with no spawn and no pid file, when the role has no file", async () => {
    const argsFile = path.join(baseDir, "args.json");
    const pluginRoot = path.join(baseDir, "plugin");
    const manager = make("ok", {
      pluginRoot,
      env: {
        FAKE_CLAUDE_MODE: "ok",
        FAKE_CLAUDE_ARGS_FILE: argsFile,
      },
    });
    const seen = ended();
    await manager.run(
      job("w1/t1/worker", {
        role: "ghost",
      }),
      seen.onEnded,
    );
    assert.equal(seen.results.length, 1);
    assert.equal(seen.results[0].id, "w1/t1/worker");
    assert.ok(seen.results[0].error.includes("ghost"));
    assert.ok(
      seen.results[0].error.includes(
        path.join(baseDir, ".claude", "agents", "ghost.md"),
      ),
    );
    assert.ok(
      seen.results[0].error.includes(
        path.join(pluginRoot, "agents", "ghost.md"),
      ),
    );
    assert.deepEqual(await pidFiles(), []);
    await assert.rejects(readFile(argsFile));
  });

  it("writes {pid, job} in {pid}.pid while the agent runs", async () => {
    const manager = make("hang");
    await manager.run(job(), () => {});
    const [name] = await until(async () => {
      const names = await pidFiles();
      return names.length === 1 && names;
    });
    const content = await readJson(path.join(agentsDir(baseDir), name));
    assert.equal(`${content.pid}.pid`, name);
    assert.deepEqual(content.job, job());
    assert.ok(alive(content.pid));
  });

  it("ends with an error when the process fails, or prints bad output", async () => {
    for (const mode of ["fail", "null-output", "bad-json"]) {
      const manager = make(mode);
      const seen = ended();
      await manager.run(job(`w-${mode}/t1/worker`), seen.onEnded);
      await until(() => seen.results.length === 1);
      assert.equal(seen.results[0].id, `w-${mode}/t1/worker`);
      assert.equal(typeof seen.results[0].error, "string");
    }
  });

  it("keeps the stderr of a failed agent in its error", async () => {
    const manager = make("fail");
    const seen = ended();
    await manager.run(job(), seen.onEnded);
    await until(() => seen.results.length === 1);
    assert.match(seen.results[0].error, /exit code 1: fake claude failed/);
  });

  it("never loses the end of an agent that exits at once", async () => {
    const manager = make("fail");
    const seen = ended();
    for (let i = 0; i < 20; i += 1) {
      await manager.run(job(`w${i}/t1/worker`), seen.onEnded);
    }
    await until(() => seen.results.length === 20);
    await until(async () => (await pidFiles()).length === 0);
    assert.equal(new Set(seen.results.map((r) => r.id)).size, 20);
  });

  it("reports a throwing onEnded and still deletes the pid file", async (t) => {
    const errors = t.mock.method(console, "error", () => {});
    const manager = make("ok");
    await manager.run(job(), () => {
      throw new Error("boom");
    });
    await until(() => errors.mock.callCount() === 1);
    await until(async () => (await pidFiles()).length === 0);
    assert.match(errors.mock.calls[0].arguments[0], /onEnded failed/);
  });

  it("ends with an error when the command cannot be spawned", async () => {
    const manager = make("ok", {
      command: path.join(baseDir, "missing"),
    });
    const seen = ended();
    await manager.run(job(), seen.onEnded);
    await until(() => seen.results.length === 1);
    assert.match(seen.results[0].error, /ENOENT/);
    assert.deepEqual(await pidFiles(), []);
  });

  it("does not run a job that this manager already runs", async () => {
    const manager = make("hang");
    await manager.run(job(), () => {});
    await manager.run(job(), () => {});
    await manager.run(job(), () => {});
    assert.equal((await pidFiles()).length, 1);
  });

  it("does not run a job whose id is in a pid file of a live process", async () => {
    const other = spawn(fake, [], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        FAKE_CLAUDE_MODE: "hang",
      },
    });
    strays.push(other);
    await writeJson(path.join(agentsDir(baseDir), `${other.pid}.pid`), {
      pid: other.pid,
      job: job(),
    });
    const manager = make("ok");
    const seen = ended();
    await manager.run(job(), seen.onEnded);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(seen.results, []);
    assert.deepEqual(await pidFiles(), [`${other.pid}.pid`]);
  });

  it("kills a job that outlives its timeout, with its process group", async () => {
    const manager = make("hang");
    const seen = ended();
    await manager.run(
      job("w1/t1/worker", {
        timeout: 0.001,
      }),
      seen.onEnded,
    );
    await until(() => seen.results.length === 1);
    assert.match(seen.results[0].error, /timeout/);
    await until(async () => (await pidFiles()).length === 0);
  });
});

describe("agent manager stop", () => {
  async function started(manager, ids) {
    for (const id of ids) {
      await manager.run(job(id), () => {
        throw new Error("onEnded must not be called");
      });
    }
    return until(async () => {
      const names = await pidFiles();
      return names.length === ids.length && names;
    });
  }

  it("stopWork kills the agents of that work and deletes their files", async () => {
    const manager = make("hang");
    const names = await started(manager, [
      "w1/t1/worker",
      "w1/t2/worker",
      "w2/t1/worker",
    ]);
    const byJob = {};
    for (const name of names) {
      const content = await readJson(path.join(agentsDir(baseDir), name));
      byJob[content.job.id] = content.pid;
    }
    await manager.stopWork("w1");
    await until(() => !alive(byJob["w1/t1/worker"]));
    await until(() => !alive(byJob["w1/t2/worker"]));
    assert.ok(alive(byJob["w2/t1/worker"]));
    assert.deepEqual(await pidFiles(), [`${byJob["w2/t1/worker"]}.pid`]);
  });

  it("stopAll kills every agent and keeps the pid files", async () => {
    const manager = make("hang");
    const names = await started(manager, ["w1/t1/worker", "w2/t1/worker"]);
    const pids = names.map((n) => Number.parseInt(n, 10));
    await manager.stopAll();
    for (const pid of pids) {
      await until(() => !alive(pid));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(await pidFiles(), names);
  });

  it("stopAll waits for the end of an agent that is being given", async () => {
    const manager = make("ok");
    let release;
    let called = false;
    await manager.run(job(), async () => {
      called = true;
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    await until(() => called);
    let stopped = false;
    const stopping = manager.stopAll().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(stopped, false);
    release();
    await stopping;
    assert.deepEqual(await pidFiles(), []);
  });
});

describe("agent manager recover", () => {
  it("kills a live pid, removes the files and returns the jobs", async () => {
    const live = spawn(fake, [], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        FAKE_CLAUDE_MODE: "hang",
      },
    });
    strays.push(live);
    const dir = agentsDir(baseDir);
    await writeJson(path.join(dir, `${live.pid}.pid`), {
      pid: live.pid,
      job: job("w1/t1/worker"),
    });
    await writeJson(path.join(dir, "999999.pid"), {
      pid: 999999,
      job: job("w2/t1/worker"),
    });
    await writeFile(path.join(dir, "123.pid"), "{corrupt");
    const manager = make("ok");
    const jobs = await manager.recover();
    assert.deepEqual(jobs.map((j) => j.id).sort(), [
      "w1/t1/worker",
      "w2/t1/worker",
    ]);
    await until(() => !alive(live.pid));
    assert.deepEqual(await pidFiles(), []);
  });

  it("never kills a live pid whose command is not the agent command", async () => {
    const live = spawn(fake, [], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        FAKE_CLAUDE_MODE: "hang",
      },
    });
    strays.push(live);
    await writeJson(path.join(agentsDir(baseDir), `${live.pid}.pid`), {
      pid: live.pid,
      job: job("w1/t1/worker"),
    });
    const seen = [];
    const manager = make("ok", {
      commandOf: (pid) => {
        seen.push(pid);
        return "/usr/bin/vim notes.txt";
      },
    });
    const jobs = await manager.recover();
    assert.deepEqual(
      jobs.map((j) => j.id),
      ["w1/t1/worker"],
    );
    assert.deepEqual(seen, [live.pid]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(alive(live.pid));
    assert.deepEqual(await pidFiles(), []);
  });

  it("returns no job when there is no folder", async () => {
    await mkdir(baseDir, {
      recursive: true,
    });
    assert.deepEqual(await make("ok").recover(), []);
  });
});
