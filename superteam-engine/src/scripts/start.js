import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { processCommand } from "../lib/process-command.js";
import { pidFilePath, processIsAlive, readPid } from "./pid-file.js";

const main = fileURLToPath(new URL("../orchestrator/main.js", import.meta.url));
const LOG = ".superteam/.r/superteam.log";
const STEP_MS = 200;
const LOG_LINES = 20;

// Whether superteam answers GET /ready on the port: the API listens only at
// the end of the start, so an answer means that the start has ended.
export async function pingReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// The last lines of the log, for the error of a start that failed.
async function logTail(baseDir) {
  const lines = (await readEnvFile(path.join(baseDir, LOG)))
    .split("\n")
    .filter((line) => line.trim() !== "");
  return lines.slice(-LOG_LINES).join("\n");
}

async function readEnvFile(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function startSuperteam({
  baseDir,
  spawn = nodeSpawn,
  isAlive = processIsAlive,
  commandOf = processCommand,
  ping = pingReady,
  sleep = delay,
  timeoutMs = 60_000,
}) {
  const env = parseEnv(
    await readEnvFile(path.join(baseDir, ".superteam/.env")),
  );
  if (!env.SUPERTEAM_PORT) {
    throw new Error("SUPERTEAM_PORT is missing in .superteam/.env");
  }
  const port = env.SUPERTEAM_PORT;
  const runDir = path.join(baseDir, ".superteam/.r");
  const existing = await readPid(baseDir);
  if (existing !== null && isAlive(existing)) {
    if (await ping(port)) {
      throw new Error(`superteam is already running (pid ${existing})`);
    }
    if (commandOf(existing)?.includes("main.js")) {
      throw new Error(
        `superteam (pid ${existing}) is starting, or does not answer on the port ${port}: read ${LOG}`,
      );
    }
  }
  // A pid file whose pid is gone or runs another command is stale.
  await rm(pidFilePath(baseDir), {
    force: true,
  });
  await mkdir(runDir, {
    recursive: true,
  });
  const log = fs.openSync(path.join(baseDir, LOG), "a");
  let child;
  try {
    child = spawn(process.execPath, [main], {
      cwd: baseDir,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
    await writeFile(pidFilePath(baseDir), String(child.pid));
  } finally {
    fs.closeSync(log);
  }

  for (let waited = 0; ; waited += STEP_MS) {
    if (await ping(port)) {
      return {
        pid: child.pid,
        port,
      };
    }
    if (!isAlive(child.pid)) {
      throw new Error(
        `superteam exited during its start:\n${await logTail(baseDir)}`,
      );
    }
    if (waited >= timeoutMs) {
      throw new Error(
        `superteam does not answer on the port ${port} after ${timeoutMs / 1000} s: read ${LOG}`,
      );
    }
    await sleep(STEP_MS);
  }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { pid, port } = await startSuperteam({
      baseDir: process.cwd(),
    });
    console.log(
      `superteam started (pid ${pid}), listening on 127.0.0.1:${port}, log: ${LOG}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
