import { readFile } from "node:fs/promises";
import path from "node:path";

export function pidFilePath(baseDir) {
  return path.join(baseDir, ".superteam/.r/superteam.pid");
}

// A positive integer, or null when the file is missing, empty or not a
// positive integer. Such a file counts as stale: pid 0 or a negative pid would
// make kill() signal a process group.
export async function readPid(baseDir) {
  let text;
  try {
    text = await readFile(pidFilePath(baseDir), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const pid = Number(trimmed);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

export function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
