import fs from "node:fs";
import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { processCommand } from "../lib/process-command.js";
import { pidFilePath, processIsAlive, readPid } from "./pid-file.js";

const STEP_MS = 100;

export async function stopSuperteam({
  baseDir,
  kill = process.kill,
  isAlive = processIsAlive,
  sleep = delay,
  timeoutMs = 10_000,
  commandOf = processCommand,
}) {
  const pid = await readPid(baseDir);
  const removePidFile = () =>
    rm(pidFilePath(baseDir), {
      force: true,
    });
  // A stale pid may be another process by now: only superteam is stopped.
  if (pid === null || !isAlive(pid) || !commandOf(pid)?.includes("main.js")) {
    await removePidFile();
    return {
      stopped: false,
    };
  }
  try {
    kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
  for (let waited = 0; isAlive(pid); waited += STEP_MS) {
    if (waited >= timeoutMs) {
      return {
        stopped: false,
        reason: "still running",
      };
    }
    await sleep(STEP_MS);
  }
  await removePidFile();
  return {
    stopped: true,
  };
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { stopped, reason } = await stopSuperteam({
      baseDir: process.cwd(),
    });
    console.log(
      stopped
        ? "superteam stopped"
        : reason
          ? `superteam was not stopped: ${reason}`
          : "superteam was not running",
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
