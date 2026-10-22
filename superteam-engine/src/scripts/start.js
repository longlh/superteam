import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { pidFilePath, processIsAlive, readPid } from "./pid-file.js";

const main = fileURLToPath(new URL("../orchestrator/main.js", import.meta.url));

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
}) {
  const env = parseEnv(
    await readEnvFile(path.join(baseDir, ".superteam/.env")),
  );
  if (!env.SUPERTEAM_PORT) {
    throw new Error("SUPERTEAM_PORT is missing in .superteam/.env");
  }
  const runDir = path.join(baseDir, ".superteam/.r");
  const existing = await readPid(baseDir);
  if (existing !== null && isAlive(existing)) {
    throw new Error(`superteam is already running (pid ${existing})`);
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
    await writeFile(pidFilePath(baseDir), String(child.pid));
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
