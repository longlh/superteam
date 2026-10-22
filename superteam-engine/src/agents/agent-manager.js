import { spawn as nodeSpawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/storage/files.js";
import { agentsDir } from "../lib/storage/paths.js";
import { buildCommand, parseResult } from "./claude-process.js";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function killGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // the process is already gone
  }
}

export function createAgentManager({
  baseDir,
  command,
  spawn = nodeSpawn,
  env = {},
  maxBudgetUsd,
}) {
  const dir = agentsDir(baseDir);
  const running = new Map();

  async function pidFileNames() {
    try {
      return (await readdir(dir)).filter((name) => name.endsWith(".pid"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function readPidFile(name) {
    try {
      const content = await readJson(path.join(dir, name));
      return content?.job ? content : null;
    } catch {
      return null;
    }
  }

  const removePidFile = (pid) =>
    rm(path.join(dir, `${pid}.pid`), {
      force: true,
    });

  async function runsInAPidFile(id) {
    for (const name of await pidFileNames()) {
      const content = await readPidFile(name);
      if (content?.job.id === id && isAlive(content.pid)) {
        return true;
      }
    }
    return false;
  }

  async function run(job, onEnded) {
    if (running.has(job.id)) {
      return;
    }
    const entry = {
      job,
      child: null,
      stopped: false,
      timedOut: false,
    };
    running.set(job.id, entry);
    if (await runsInAPidFile(job.id)) {
      running.delete(job.id);
      return;
    }
    if (entry.stopped) {
      running.delete(job.id);
      return;
    }

    const built = buildCommand(job, {
      maxBudgetUsd,
    });
    const child = spawn(command ?? built.command, built.args, {
      cwd: job.workdir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
      },
    });
    entry.child = child;

    let stdout = "";
    let settled = false;
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.resume();

    if (child.pid !== undefined) {
      await writeJson(path.join(dir, `${child.pid}.pid`), {
        pid: child.pid,
        job,
      });
    }

    const timer = setTimeout(
      () => {
        entry.timedOut = true;
        killGroup(child.pid);
      },
      job.timeout * 60 * 1000,
    );

    async function settle(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      running.delete(job.id);
      if (entry.stopped) {
        return;
      }
      try {
        await onEnded({
          id: job.id,
          ...result,
        });
      } finally {
        if (child.pid !== undefined) {
          await removePidFile(child.pid);
        }
      }
    }

    child.on("error", (error) => {
      settle({
        error: `the agent could not start: ${error.message}`,
      });
    });
    child.on("close", (code) => {
      if (entry.timedOut) {
        settle({
          error: `the agent was killed by the timeout of ${job.timeout} minutes`,
        });
        return;
      }
      settle(parseResult(stdout, code));
    });
    if (entry.stopped) {
      killGroup(child.pid);
    }
  }

  async function stopWork(workId) {
    for (const [id, entry] of [...running]) {
      if (!id.startsWith(`${workId}/`)) {
        continue;
      }
      entry.stopped = true;
      if (entry.child?.pid !== undefined) {
        killGroup(entry.child.pid);
        await removePidFile(entry.child.pid);
      }
      running.delete(id);
    }
  }

  async function stopAll() {
    for (const entry of running.values()) {
      entry.stopped = true;
      if (entry.child?.pid !== undefined) {
        killGroup(entry.child.pid);
      }
    }
    running.clear();
  }

  async function recover() {
    const jobs = [];
    for (const name of await pidFileNames()) {
      const content = await readPidFile(name);
      if (content) {
        if (isAlive(content.pid)) {
          killGroup(content.pid);
        }
        jobs.push(content.job);
      }
      await rm(path.join(dir, name), {
        force: true,
      });
    }
    return jobs;
  }

  return {
    run,
    stopWork,
    stopAll,
    recover,
  };
}
