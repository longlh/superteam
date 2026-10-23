#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

// The mode of this run: from FAKE_CLAUDE_MODES, a JSON map from the name of
// the folder it runs in (the task id, or the work id for the work merger),
// then FAKE_CLAUDE_MODE, then "ok".
function modeOf(cwd) {
  const modes = process.env.FAKE_CLAUDE_MODES
    ? JSON.parse(process.env.FAKE_CLAUDE_MODES)
    : {};
  return modes[path.basename(cwd)] ?? process.env.FAKE_CLAUDE_MODE ?? "ok";
}

function arg(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const git = (args) =>
  execFileSync("git", args, {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .trim();

// Only a folder that is the top of a git worktree is changed, so a run in any
// other folder only prints its result.
function isWorktree() {
  try {
    return (
      realpathSync(git(["rev-parse", "--show-toplevel"])) === realpathSync(".")
    );
  } catch {
    return false;
  }
}

function hasLocal(branch) {
  try {
    git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

// The number of the numbered items under the line `title`.
function itemsUnder(lines, title) {
  const at = lines.indexOf(title);
  if (at === -1) {
    return 0;
  }
  let count = 0;
  for (const line of lines.slice(at + 1)) {
    if (!/^\d+\. /.test(line)) {
      break;
    }
    count += 1;
  }
  return count;
}

// Does the job of the prompt: merges the branches it names, or writes a file
// named after the role and commits it. Returns the DOD checklist: for a
// merger, true for each item of the DOD of the work; for a worker, `met` for
// each item of the DOD of the task.
function work(prompt, met) {
  const lines = prompt.split("\n");
  const merge = lines.find((line) => line.startsWith("Branches to merge: "));
  if (merge !== undefined) {
    const branches = merge
      .slice("Branches to merge: ".length)
      .split(", ")
      .filter((b) => b !== "");
    for (const branch of branches) {
      git([
        "merge",
        "--no-edit",
        hasLocal(branch) ? branch : `origin/${branch}`,
      ]);
    }
  } else {
    const name = `${arg("--agent")}-${path.basename(process.cwd())}.txt`;
    writeFileSync(name, `${prompt}\n`);
    git(["add", "--", name]);
    git(["commit", "-m", `Write ${name}`]);
  }
  return merge === undefined
    ? Array(itemsUnder(lines, "DOD of the task:")).fill(met)
    : Array(itemsUnder(lines, "DOD of the work:")).fill(true);
}

const mode = modeOf(process.cwd());

// A test reads the args of this run from this file.
if (process.env.FAKE_CLAUDE_ARGS_FILE) {
  writeFileSync(
    process.env.FAKE_CLAUDE_ARGS_FILE,
    JSON.stringify(process.argv.slice(2)),
  );
}

const result = {
  type: "result",
  is_error: false,
  structured_output: {
    summary: "done",
    data: {
      dodChecklist: [],
    },
  },
};

switch (mode) {
  // fail-dod does the job as ok, but meets no item of the DOD of its task.
  case "ok":
  case "fail-dod":
    if (isWorktree()) {
      result.structured_output.data.dodChecklist = work(
        arg("-p") ?? "",
        mode === "ok",
      );
    }
    console.log(JSON.stringify(result));
    break;
  case "fail":
    console.error("fake claude failed on purpose");
    process.exit(1);
    break;
  case "null-output":
    console.log(
      JSON.stringify({
        ...result,
        structured_output: null,
      }),
    );
    break;
  case "bad-json":
    console.log("this is not json");
    break;
  case "hang":
    setInterval(() => {}, 1000);
    break;
  default:
    console.error(`unknown FAKE_CLAUDE_MODE ${mode}`);
    process.exit(2);
}
