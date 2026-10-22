import { execFileSync } from "node:child_process";

// The command line of a live process, or null when it cannot be read (the
// process is gone). It tells a process of ours from another one that has
// taken its pid since.
export function processCommand(pid) {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
