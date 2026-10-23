import { readFileSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { processCommand } from "../lib/process-command.js";
import { processIsAlive } from "../scripts/pid-file.js";

export function lockPath(baseDir) {
  return path.join(baseDir, ".superteam", ".r", "superteam.lock");
}

async function holder(file) {
  try {
    const pid = Number((await readFile(file, "utf8")).trim());
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

// Takes the lock of the workspace, so that one process of superteam runs in
// it. The lock is created only when it is missing (`wx`), so two starts at
// once cannot both take it. A lock of a pid that is gone, or that runs another
// command (a pid can be reused), is stale and replaced.
export async function takeLock(
  baseDir,
  {
    pid = process.pid,
    isAlive = processIsAlive,
    commandOf = processCommand,
  } = {},
) {
  const file = lockPath(baseDir);
  await mkdir(path.dirname(file), {
    recursive: true,
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(file, String(pid), {
        flag: "wx",
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
    const other = await holder(file);
    const running =
      other !== null &&
      isAlive(other) &&
      (commandOf(other)?.includes("main.js") ?? false);
    if (running || attempt > 0) {
      throw new Error(`superteam is already running (pid ${other})`);
    }
    await rm(file, {
      force: true,
    });
  }
}

// Removes the lock when it holds `pid`. It is sync, to run in an `exit`
// listener.
export function releaseLock(baseDir, pid) {
  const file = lockPath(baseDir);
  try {
    if (readFileSync(file, "utf8").trim() === String(pid)) {
      rmSync(file, {
        force: true,
      });
    }
  } catch {
    // no lock
  }
}
