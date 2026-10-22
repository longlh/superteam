import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const main = fileURLToPath(new URL("../orchestrator/main.js", import.meta.url));

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function readOrNull(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function startSuperteam({
  baseDir,
  spawn = nodeSpawn,
  isAlive = processIsAlive,
}) {
  const env = parseEnv(
    (await readOrNull(path.join(baseDir, ".superteam/.env"))) ?? "",
  );
  if (!env.SUPERTEAM_PORT) {
    throw new Error("SUPERTEAM_PORT is missing in .superteam/.env");
  }
  const runDir = path.join(baseDir, ".superteam/.r");
  const pidFile = path.join(runDir, "superteam.pid");
  const text = await readOrNull(pidFile);
  if (text !== null) {
    const pid = Number(text.trim());
    if (Number.isInteger(pid) && isAlive(pid)) {
      throw new Error(`superteam is already running (pid ${pid})`);
    }
  }
  await mkdir(runDir, {
    recursive: true,
  });
  const log = fs.openSync(path.join(runDir, "superteam.log"), "a");
  try {
    const child = spawn(process.execPath, [main], {
      cwd: baseDir,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
    await writeFile(pidFile, String(child.pid));
    return {
      pid: child.pid,
    };
  } finally {
    fs.closeSync(log);
  }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { pid } = await startSuperteam({
      baseDir: process.cwd(),
    });
    console.log(
      `superteam started (pid ${pid}), log: .superteam/.r/superteam.log`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
