import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT_BRANCH = "main";

function realRun(command, args, { cwd }) {
  return execFileAsync(command, args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// A failure with the shape of the one of execFile: a message, an exit code
// and the stderr.
function failure(args, stderr) {
  return Object.assign(
    new Error(`Command failed: gh ${args.join(" ")}\n${stderr}`),
    {
      code: 1,
      stdout: "",
      stderr,
    },
  );
}

// A `run` for `createGitAdapter`: `git` is the real command, and `gh` keeps
// the pull requests in memory. A merge is a real squash merge of the branch
// into the root branch of `origin`.
export function createFakeGh({ baseDir }) {
  const pullRequests = new Map();
  let count = 0;

  function find(args, branch) {
    const pr = pullRequests.get(branch);
    if (pr === undefined) {
      throw failure(args, `no pull requests found for branch "${branch}"\n`);
    }
    return pr;
  }

  async function squashMerge(branch, title) {
    const { stdout } = await realRun("git", ["remote", "get-url", "origin"], {
      cwd: baseDir,
    });
    const clone = await mkdtemp(path.join(tmpdir(), "fake-gh-"));
    const git = (args) =>
      realRun(
        "git",
        [
          "-c",
          "user.name=Fake GitHub",
          "-c",
          "user.email=fake-gh@example.com",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        {
          cwd: clone,
        },
      );
    try {
      await git(["clone", "--quiet", stdout.trim(), "."]);
      await git(["checkout", ROOT_BRANCH]);
      await git(["merge", "--squash", `origin/${branch}`]);
      await git(["commit", "-m", title]);
      await git(["push", "origin", ROOT_BRANCH]);
    } finally {
      await rm(clone, {
        recursive: true,
        force: true,
      });
    }
  }

  async function gh(args) {
    const [group, action, branch] = args;
    if (group !== "pr") {
      throw failure(args, `unknown command ${group}\n`);
    }
    switch (action) {
      case "create": {
        const head = args[args.indexOf("--head") + 1];
        const title = args[args.indexOf("--title") + 1];
        count += 1;
        const url = `https://github.com/fake/project/pull/${count}`;
        pullRequests.set(head, {
          url,
          title,
          number: count,
          state: "OPEN",
        });
        return {
          stdout: `${url}\n`,
          stderr: "",
        };
      }
      case "view": {
        const { url, state } = find(args, branch);
        return {
          stdout: `${JSON.stringify({
            url,
            state,
          })}\n`,
          stderr: "",
        };
      }
      case "merge": {
        const pr = find(args, branch);
        if (pr.state !== "OPEN") {
          throw failure(args, `pull request #${pr.number} is not open\n`);
        }
        await squashMerge(branch, `${pr.title} (#${pr.number})`);
        pr.state = "MERGED";
        return {
          stdout: "",
          stderr: "",
        };
      }
      case "close": {
        const pr = find(args, branch);
        if (pr.state === "OPEN") {
          pr.state = "CLOSED";
        }
        return {
          stdout: "",
          stderr: "",
        };
      }
      default:
        throw failure(args, `unknown command pr ${action}\n`);
    }
  }

  return (command, args, options) =>
    command === "gh" ? gh(args) : realRun(command, args, options);
}
