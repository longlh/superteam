import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

  // fetch, push and the delete of a remote branch all update the refs of
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

  async function rootBranch() {
    const { stdout } = await git(["branch", "--show-current"]);
    return stdout.trim();
  }

  // The content of `file` at `ref`, or null when the file is missing there.
  async function showFile(ref, file) {
    try {
      const { stdout } = await git(["show", `${ref}:${file}`]);
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
  }

  return {
    rootBranch,

    // Adds `line` to the exclude file of the common git dir (shared by every
    // worktree) when it is missing, so a worktree never commits the runtime
    // files, even when the .gitignore of the project is not committed.
    async ensureExcluded(line) {
      const { stdout } = await git(["rev-parse", "--git-common-dir"]);
      const file = path.resolve(baseDir, stdout.trim(), "info", "exclude");
      let text = "";
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      if (text.split("\n").some((l) => l.trim() === line)) {
        return;
      }
      const prefix = text === "" || text.endsWith("\n") ? "" : "\n";
      await mkdir(path.dirname(file), {
        recursive: true,
      });
      await writeFile(file, `${text}${prefix}${line}\n`);
    },

    // The preflight of a start: is a remote `origin` set, and is gh signed in.
    async hasOrigin() {
      try {
        await git(["remote", "get-url", "origin"]);
        return true;
      } catch {
        return false;
      }
    },

    async checkForge() {
      try {
        await gh(["auth", "status"]);
        return true;
      } catch {
        return false;
      }
    },

    // The branch on origin that the root branch tracks, its upstream, such as
    // `develop`, or null when it tracks no branch on origin or HEAD is
    // detached. Its name can differ from the name of the root branch.
    async rootUpstream() {
      const branch = await rootBranch();
      if (branch === "") {
        return null;
      }
      const { stdout } = await git([
        "for-each-ref",
        "--format=%(upstream:remotename) %(upstream:remoteref)",
        `refs/heads/${branch}`,
      ]);
      const [remote, ref = ""] = stdout.trim().split(" ");
      if (remote !== "origin" || !ref.startsWith("refs/heads/")) {
        return null;
      }
      return ref.slice("refs/heads/".length);
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
        // A branch made from `origin/<base>` would track it.
        await git([
          "worktree",
          "add",
          "--no-track",
          "-b",
          branch,
          folder,
          base,
        ]);
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

    hasRemoteBranch: hasRemote,

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

    async readFileOnBranch(branch, file) {
      let ref;
      if (await hasLocal(branch)) {
        ref = `refs/heads/${branch}`;
      } else if (await hasRemote(branch)) {
        ref = `refs/remotes/origin/${branch}`;
      } else {
        return null;
      }
      return showFile(ref, file);
    },

    // Only from origin, such as on the upstream of the root branch, whose
    // local branch can hold commits that are not pushed.
    async readFileOnRemote(branch, file) {
      if (!(await hasRemote(branch))) {
        return null;
      }
      return showFile(`refs/remotes/origin/${branch}`, file);
    },

    async getPullRequest(branch) {
      let stdout;
      try {
        ({ stdout } = await gh([
          "pr",
          "view",
          branch,
          "--json",
          "url,state,baseRefName",
        ]));
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
      const { url, state, baseRefName } = JSON.parse(stdout);
      return {
        url,
        state: PR_STATES[state],
        base: baseRefName,
      };
    },

    // The merged pull requests whose head branch starts with `prefix`, with the
    // branch that each was merged on. gh cannot filter on a prefix, so the last
    // 1000 merged pull requests of the repository are read.
    async listMergedPullRequests(prefix) {
      const { stdout } = await gh([
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "1000",
        "--json",
        "headRefName,baseRefName",
      ]);
      return JSON.parse(stdout)
        .filter((pr) => pr.headRefName.startsWith(prefix))
        .map((pr) => ({
          branch: pr.headRefName,
          base: pr.baseRefName,
        }));
    },

    // On the base of the work: without `--base`, gh would target the default
    // branch of the repository.
    async openPullRequest({ branch, base, title, body }) {
      const { stdout } = await gh([
        "pr",
        "create",
        "--base",
        base,
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
  };
}
