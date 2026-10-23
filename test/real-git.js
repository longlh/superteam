import { execFileSync } from "node:child_process";
import path from "node:path";

// On macOS, /usr/bin/git is a shim that runs xcrun first. It is slow when many
// git commands run at the same time, so the tests use the real git binary.
if (process.platform === "darwin") {
  try {
    const git = execFileSync("xcrun", ["--find", "git"], {
      encoding: "utf8",
    }).trim();
    process.env.PATH = `${path.dirname(git)}${path.delimiter}${process.env.PATH}`;
  } catch {
    // No xcrun: the git on the PATH is used.
  }
}
