import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PR_STATES = {
  OPEN: "open",
  MERGED: "merged",
  CLOSED: "closed",
};

function defaultRun(command, args, { cwd }) {
  return execFileAsync(command, args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function createGitAdapter({ baseDir, run = defaultRun }) {
  const git = (args, cwd = baseDir) =>
    run("git", args, {
      cwd,
    });
  const gh = (args) =>
    run("gh", args, {
      cwd: baseDir,
    });

  // `show-ref --verify --quiet` exits 1 only when the ref is missing: any other
  // failure (exit 128, git not found) is a real error and propagates.
  async function refExists(ref) {
    try {
      await git(["show-ref", "--verify", "--quiet", ref]);
      return true;
    } catch (error) {
      if (error.code === 1) {
        return false;
      }
      throw error;
    }
  }

  // fetch, pull, push and the delete of a remote branch all update the refs of
  // `origin`: run at the same time (a request and a handler), git refuses one
  // with "cannot lock ref". So they run one at a time, in the order of the
  // calls, and a failure does not block the next one.
  let tail = Promise.resolve();
  function oneAtATime(fn) {
    return (...args) => {
      const result = tail.then(() => fn(...args));
      tail = result.catch(() => {});
      return result;
    };
  }

  const hasLocal = (branch) => refExists(`refs/heads/${branch}`);
  const hasRemote = (branch) => refExists(`refs/remotes/origin/${branch}`);

  return {
    async rootBranch() {
      const { stdout } = await git(["branch", "--show-current"]);
      return stdout.trim();
    },

    fetch: oneAtATime(async () => {
      await git(["fetch", "--prune", "origin"]);
    }),

    async createWorktree({ folder, branch, base }) {
      if (existsSync(folder)) {
        return;
      }
      if (await hasLocal(branch)) {
        await git(["worktree", "add", folder, branch]);
      } else if (await hasRemote(branch)) {
        await git([
          "worktree",
          "add",
          "--track",
          "-b",
          branch,
          folder,
          `origin/${branch}`,
        ]);
      } else {
        await git(["worktree", "add", "-b", branch, folder, base]);
      }
    },

    async removeWorktree(folder) {
      if (existsSync(folder)) {
        await git(["worktree", "remove", "--force", folder]);
      }
      await git(["worktree", "prune"]);
    },

    async commitAll(folder, message) {
      await git(["add", "-A"], folder);
      const { stdout } = await git(["status", "--porcelain"], folder);
      if (stdout.trim() === "") {
        return false;
      }
      await git(["commit", "-m", message], folder);
      return true;
    },

    push: oneAtATime(async (branch) => {
      await git(["push", "--set-upstream", "origin", branch]);
    }),

    async branchExists(branch) {
      return (await hasLocal(branch)) || (await hasRemote(branch));
    },

    deleteBranch: oneAtATime(async (branch) => {
      if (await hasLocal(branch)) {
        await git(["branch", "-D", branch]);
      }
      const { stdout } = await git([
        "ls-remote",
        "--heads",
        "origin",
        `refs/heads/${branch}`,
      ]);
      if (stdout.trim() !== "") {
        await git(["push", "origin", "--delete", branch]);
      }
    }),

    async listBranches(prefix) {
      const { stdout } = await git([
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads/",
        "refs/remotes/origin/",
      ]);
      const names = new Set();
      for (const ref of stdout.split("\n")) {
        const name = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref.startsWith("refs/remotes/origin/")
            ? ref.slice("refs/remotes/origin/".length)
            : null;
        if (name !== null && name !== "HEAD" && name.startsWith(prefix)) {
          names.add(name);
        }
      }
      return [...names].sort();
    },

    async readFileOnBranch(branch, path) {
      let ref;
      if (await hasLocal(branch)) {
        ref = `refs/heads/${branch}`;
      } else if (await hasRemote(branch)) {
        ref = `refs/remotes/origin/${branch}`;
      } else {
        return null;
      }
      try {
        const { stdout } = await git(["show", `${ref}:${path}`]);
        return stdout;
      } catch (error) {
        const text = `${error.message}\n${error.stderr ?? ""}`;
        // The last case is a branch deleted between the check and the read,
        // such as by an archive while the works are listed.
        if (
          /does not exist in|exists on disk, but not in/.test(text) ||
          text.includes(`invalid object name '${ref}'`)
        ) {
          return null;
        }
        throw error;
      }
    },

    async getPullRequest(branch) {
      let stdout;
      try {
        ({ stdout } = await gh(["pr", "view", branch, "--json", "url,state"]));
      } catch (error) {
        if (
          `${error.message}\n${error.stderr ?? ""}`.includes(
            "no pull requests found",
          )
        ) {
          return null;
        }
        throw error;
      }
      const { url, state } = JSON.parse(stdout);
      return {
        url,
        state: PR_STATES[state],
      };
    },

    async openPullRequest({ branch, title, body }) {
      const { stdout } = await gh([
        "pr",
        "create",
        "--head",
        branch,
        "--title",
        title,
        "--body",
        body,
      ]);
      return stdout.trim();
    },

    async mergePullRequest(branch) {
      await gh(["pr", "merge", branch, "--squash"]);
    },

    async closePullRequest(branch) {
      await gh(["pr", "close", branch]);
    },

    pullRoot: oneAtATime(async () => {
      await git(["pull", "--ff-only"]);
    }),
  };
}
