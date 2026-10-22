import fs from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export async function stopSuperteam({
  baseDir,
  kill = process.kill,
  isAlive = processIsAlive,
}) {
  const pidFile = path.join(baseDir, ".superteam/.r/superteam.pid");
  let text;
  try {
    text = await readFile(pidFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        stopped: false,
      };
    }
    throw error;
  }
  const pid = Number(text.trim());
  const live = Number.isInteger(pid) && isAlive(pid);
  if (live) {
    kill(pid, "SIGTERM");
  }
  await rm(pidFile, {
    force: true,
  });
  return {
    stopped: live,
  };
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { stopped } = await stopSuperteam({
      baseDir: process.cwd(),
    });
    console.log(stopped ? "superteam stopped" : "superteam was not running");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
