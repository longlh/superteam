import { spawn as nodeSpawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/storage/files.js";
import { processCommand } from "../lib/process-command.js";
import { agentsDir } from "../lib/storage/paths.js";
import {
  buildCommand,
  CLAUDE,
  parseResult,
  STDERR_TAIL,
} from "./claude-process.js";

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
  commandOf = processCommand,
}) {
  const dir = agentsDir(baseDir);
  const running = new Map();
  // The ends that are being given to onEnded: stopAll waits for them, so a
  // shutdown never loses the end of an agent that has already exited.
  const ending = new Set();

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

  const pidFile = (pid) => path.join(dir, `${pid}.pid`);

  const removePidFile = (pid) =>
    rm(pidFile(pid), {
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
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    // Only the end of the stderr is kept, for the error of the job.
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });

    const pidWritten =
      child.pid === undefined
        ? Promise.resolve()
        : writeJson(pidFile(child.pid), {
            pid: child.pid,
            job,
          }).catch((error) => {
            console.error(`agent ${job.id}: pid file not written`, error);
          });
    entry.pidWritten = pidWritten;

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
      const end = giveEnd(result);
      ending.add(end);
      try {
        await end;
      } finally {
        ending.delete(end);
      }
    }

    async function giveEnd(result) {
      clearTimeout(timer);
      running.delete(job.id);
      await pidWritten;
      if (entry.stopped) {
        return;
      }
      try {
        await onEnded({
          id: job.id,
          ...result,
        });
      } catch (error) {
        console.error(`agent ${job.id}: onEnded failed`, error);
      }
      if (child.pid !== undefined) {
        await removePidFile(child.pid);
      }
    }

    child.on("error", (error) => {
      settle({
        error: `the agent could not start: ${error.message}`,
      });
    });
    child.on("close", (code, signal) => {
      if (entry.timedOut) {
        settle({
          error: `the agent was killed by the timeout of ${job.timeout} minutes`,
        });
        return;
      }
      settle(parseResult(stdout, code, signal, stderr));
    });
    if (entry.stopped) {
      killGroup(child.pid);
    }
    await pidWritten;
  }

  async function stopWork(workId) {
    for (const [id, entry] of [...running]) {
      if (!id.startsWith(`${workId}/`)) {
        continue;
      }
      entry.stopped = true;
      if (entry.child?.pid !== undefined) {
        killGroup(entry.child.pid);
        await entry.pidWritten;
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
    await Promise.allSettled(ending);
  }

  function isAgent(pid) {
    const name = path.basename(command ?? CLAUDE);
    return commandOf(pid)?.includes(name) ?? false;
  }

  async function recover() {
    const jobs = [];
    for (const name of await pidFileNames()) {
      const content = await readPidFile(name);
      if (content) {
        // A pid of a leftover file may be another process by now: it is
        // killed only when it still runs the command of the agents.
        if (isAlive(content.pid) && isAgent(content.pid)) {
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
