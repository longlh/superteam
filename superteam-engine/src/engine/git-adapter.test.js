import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { createGitAdapter } from "./git-adapter.js";

const temps = [];

after(() => {
  for (const dir of temps) {
    rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
});

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

function clone(origin, dir) {
  git(tmpdir(), "clone", "-q", origin, dir);
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "git-adapter-"));
  temps.push(root);
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  const baseDir = join(root, "base");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "init", "-q", "-b", "main", seed);
  git(seed, "config", "user.name", "Test");
  git(seed, "config", "user.email", "test@example.com");
  writeFileSync(join(seed, "README.md"), "hello\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "init");
  git(seed, "push", "-q", origin, "main");
  clone(origin, baseDir);
  return {
    root,
    origin,
    baseDir,
    adapter: createGitAdapter({
      baseDir,
    }),
    folder: (name) => join(root, "worktrees", name),
  };
}

function writeIn(folder, path, text) {
  const file = join(folder, path);
  mkdirSync(join(file, ".."), {
    recursive: true,
  });
  writeFileSync(file, text);
}

describe("git parts (real git)", () => {
  test("rootBranch returns the current branch of baseDir", async () => {
    const { adapter } = makeRepo();
    assert.equal(await adapter.rootBranch(), "main");
  });

  test("createWorktree makes the folder and the branch, and does nothing the second time", async () => {
    const { adapter, baseDir, folder } = makeRepo();
    const dir = folder("works/a");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    assert.ok(existsSync(join(dir, "README.md")));
    assert.equal(git(dir, "branch", "--show-current"), "works/a");
    assert.equal(await adapter.branchExists("works/a"), true);
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    assert.match(git(baseDir, "worktree", "list"), /works\/a/);
  });

  test("createWorktree attaches to a branch that already exists", async () => {
    const { adapter, folder } = makeRepo();
    const first = folder("works/a");
    await adapter.createWorktree({
      folder: first,
      branch: "works/a",
      base: "main",
    });
    writeIn(first, "x.txt", "x");
    await adapter.commitAll(first, "x");
    await adapter.removeWorktree(first);
    const second = folder("again");
    await adapter.createWorktree({
      folder: second,
      branch: "works/a",
      base: "main",
    });
    assert.ok(existsSync(join(second, "x.txt")));
  });

  test("createWorktree attaches to a branch that exists only on origin", async () => {
    const { adapter, origin, root, folder } = makeRepo();
    const other = join(root, "other");
    clone(origin, other);
    git(other, "checkout", "-q", "-b", "works/r");
    writeIn(other, "r.txt", "r");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "r");
    git(other, "push", "-q", "origin", "works/r");
    await adapter.fetch();
    const dir = folder("works/r");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/r",
      base: "main",
    });
    assert.ok(existsSync(join(dir, "r.txt")));
  });

  test("removeWorktree removes the folder and keeps the branch, and is quiet when it is gone", async () => {
    const { adapter, folder } = makeRepo();
    const dir = folder("works/a");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    await adapter.removeWorktree(dir);
    assert.equal(existsSync(dir), false);
    assert.equal(await adapter.branchExists("works/a"), true);
    await adapter.removeWorktree(dir);
  });

  test("commitAll is false on a clean tree and true after a file is added", async () => {
    const { adapter, folder } = makeRepo();
    const dir = folder("works/a");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    const before = git(dir, "rev-parse", "HEAD");
    assert.equal(await adapter.commitAll(dir, "nothing"), false);
    assert.equal(git(dir, "rev-parse", "HEAD"), before);
    writeIn(dir, ".superteam/.p/works/a.json", "{}");
    assert.equal(await adapter.commitAll(dir, "add a"), true);
    assert.equal(git(dir, "log", "-1", "--format=%s"), "add a");
  });

  test("push, branchExists, readFileOnBranch", async () => {
    const { adapter, folder } = makeRepo();
    const dir = folder("works/a");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    writeIn(dir, ".superteam/.p/works/a.json", '{"id":"a"}');
    await adapter.commitAll(dir, "add a");
    await adapter.push("works/a");
    assert.equal(await adapter.branchExists("works/a"), true);
    assert.equal(await adapter.branchExists("works/none"), false);
    assert.equal(
      await adapter.readFileOnBranch("works/a", ".superteam/.p/works/a.json"),
      '{"id":"a"}',
    );
    assert.equal(
      await adapter.readFileOnBranch("works/a", "missing.json"),
      null,
    );
    assert.equal(
      await adapter.readFileOnBranch("works/none", "README.md"),
      null,
    );
  });

  test("readFileOnBranch reads from origin when the branch is not local", async () => {
    const { adapter, origin, root } = makeRepo();
    const other = join(root, "other");
    clone(origin, other);
    git(other, "checkout", "-q", "-b", "works/b");
    writeIn(other, "b.txt", "from origin");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "b");
    git(other, "push", "-q", "origin", "works/b");
    assert.equal(await adapter.readFileOnBranch("works/b", "b.txt"), null);
    await adapter.fetch();
    assert.equal(
      await adapter.readFileOnBranch("works/b", "b.txt"),
      "from origin",
    );
    assert.equal(await adapter.readFileOnBranch("works/b", "nope.txt"), null);
  });

  test("deleteBranch removes the branch locally and on origin, and is quiet when called again", async () => {
    const { adapter, baseDir, origin, folder } = makeRepo();
    const dir = folder("works/a");
    await adapter.createWorktree({
      folder: dir,
      branch: "works/a",
      base: "main",
    });
    await adapter.push("works/a");
    await adapter.removeWorktree(dir);
    await adapter.deleteBranch("works/a");
    assert.equal(git(baseDir, "branch", "--list", "works/a"), "");
    assert.equal(git(baseDir, "ls-remote", "--heads", origin, "works/a"), "");
    assert.equal(await adapter.branchExists("works/a"), false);
    await adapter.deleteBranch("works/a");
  });

  test("deleteBranch removes a branch that is only local", async () => {
    const { adapter, baseDir } = makeRepo();
    git(baseDir, "branch", "works/l");
    await adapter.deleteBranch("works/l");
    assert.equal(git(baseDir, "branch", "--list", "works/l"), "");
  });

  test("listBranches returns local and pushed branches with the prefix, deduped", async () => {
    const { adapter, folder } = makeRepo();
    await adapter.createWorktree({
      folder: folder("a"),
      branch: "works/a",
      base: "main",
    });
    await adapter.createWorktree({
      folder: folder("b"),
      branch: "works/b",
      base: "main",
    });
    await adapter.createWorktree({
      folder: folder("t"),
      branch: "tasks/a/t1",
      base: "main",
    });
    await adapter.push("works/a");
    assert.deepEqual(await adapter.listBranches("works/"), [
      "works/a",
      "works/b",
    ]);
  });

  test("a branch pushed from a second clone is listed only after fetch", async () => {
    const { adapter, origin, root } = makeRepo();
    const other = join(root, "other");
    clone(origin, other);
    git(other, "checkout", "-q", "-b", "works/z");
    git(other, "push", "-q", "origin", "works/z");
    assert.deepEqual(await adapter.listBranches("works/"), []);
    await adapter.fetch();
    assert.deepEqual(await adapter.listBranches("works/"), ["works/z"]);
  });

  test("a branch name is never interpreted by a shell", async () => {
    const { adapter, baseDir } = makeRepo();
    assert.equal(await adapter.branchExists("works/$(touch pwned)"), false);
    await adapter.deleteBranch("works/$(touch pwned)");
    assert.equal(existsSync(join(baseDir, "pwned")), false);
    assert.equal(existsSync(join(baseDir, "works", "$(touch pwned)")), false);
  });
});

function fakeRun(answer) {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({
      command,
      args,
      cwd: options.cwd,
    });
    return answer(command, args);
  };
  return {
    calls,
    run,
  };
}

describe("gh parts (fake run)", () => {
  test("openPullRequest runs gh pr create on the root branch and returns the url", async () => {
    const { calls, run } = fakeRun((command) => ({
      stdout:
        command === "git" ? "develop\n" : "https://github.com/o/r/pull/1\n",
    }));
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    const url = await adapter.openPullRequest({
      branch: "works/a",
      title: "T",
      body: "B",
    });
    assert.equal(url, "https://github.com/o/r/pull/1");
    assert.deepEqual(calls, [
      {
        command: "git",
        args: ["branch", "--show-current"],
        cwd: "/base",
      },
      {
        command: "gh",
        args: [
          "pr",
          "create",
          "--base",
          "develop",
          "--head",
          "works/a",
          "--title",
          "T",
          "--body",
          "B",
        ],
        cwd: "/base",
      },
    ]);
  });

  test("getPullRequest maps OPEN, MERGED and CLOSED", async () => {
    for (const [state, expected] of [
      ["OPEN", "open"],
      ["MERGED", "merged"],
      ["CLOSED", "closed"],
    ]) {
      const { calls, run } = fakeRun(() => ({
        stdout: JSON.stringify({
          url: "U",
          state,
        }),
      }));
      const adapter = createGitAdapter({
        baseDir: "/base",
        run,
      });
      assert.deepEqual(await adapter.getPullRequest("works/a"), {
        url: "U",
        state: expected,
      });
      assert.deepEqual(calls[0].args, [
        "pr",
        "view",
        "works/a",
        "--json",
        "url,state",
      ]);
      assert.equal(calls[0].command, "gh");
    }
  });

  test("getPullRequest returns null when there is no pull request, and rethrows other errors", async () => {
    const none = fakeRun(() => {
      throw new Error('no pull requests found for branch "works/a"');
    });
    assert.equal(
      await createGitAdapter({
        baseDir: "/base",
        run: none.run,
      }).getPullRequest("works/a"),
      null,
    );
    const bad = fakeRun(() => {
      throw new Error("gh: auth failed");
    });
    await assert.rejects(
      createGitAdapter({
        baseDir: "/base",
        run: bad.run,
      }).getPullRequest("works/a"),
      /auth failed/,
    );
  });

  test("mergePullRequest and closePullRequest run gh", async () => {
    const { calls, run } = fakeRun(() => ({
      stdout: "",
    }));
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    await adapter.mergePullRequest("works/a");
    await adapter.closePullRequest("works/a");
    assert.deepEqual(
      calls.map((c) => [c.command, ...c.args]),
      [
        ["gh", "pr", "merge", "works/a", "--squash"],
        ["gh", "pr", "close", "works/a"],
      ],
    );
  });
});

describe("real git failures propagate", () => {
  const broken = () => {
    const run = async () => {
      throw Object.assign(new Error("fatal: not a git repository"), {
        code: 128,
      });
    };
    return createGitAdapter({
      baseDir: "/base",
      run,
    });
  };

  test("branchExists and deleteBranch rethrow a failure that is not a missing ref", async () => {
    await assert.rejects(
      broken().branchExists("works/a"),
      /not a git repository/,
    );
    await assert.rejects(
      broken().deleteBranch("works/a"),
      /not a git repository/,
    );
  });

  test("readFileOnBranch rethrows a failure that is not a missing file", async () => {
    await assert.rejects(
      broken().readFileOnBranch("works/a", "x.json"),
      /not a git repository/,
    );
  });

  test("readFileOnBranch returns null when the branch is deleted between the check and the read", async () => {
    const run = async (command, args) => {
      if (args[0] === "show-ref") {
        return {
          stdout: "",
        };
      }
      throw Object.assign(
        new Error(
          "Command failed: git show refs/heads/works/a:x.json\nfatal: invalid object name 'refs/heads/works/a'.",
        ),
        {
          code: 128,
          stderr: "fatal: invalid object name 'refs/heads/works/a'.\n",
        },
      );
    };
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    assert.equal(await adapter.readFileOnBranch("works/a", "x.json"), null);
  });

  test("readFileOnBranch rethrows a git show failure that is not a missing path", async () => {
    const run = async (command, args) => {
      if (args[0] === "show-ref") {
        return {
          stdout: "",
        };
      }
      throw Object.assign(new Error("fatal: bad object"), {
        code: 128,
      });
    };
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    await assert.rejects(
      adapter.readFileOnBranch("works/a", "x.json"),
      /bad object/,
    );
  });
});

describe("the calls that update the refs of origin", () => {
  test("fetch, push, deleteBranch and pullRoot run one at a time", async () => {
    let running = 0;
    let most = 0;
    const run = async (command, args) => {
      if (args[0] === "show-ref") {
        return {
          stdout: "",
        };
      }
      if (args[0] === "ls-remote") {
        return {
          stdout: "abc\trefs/heads/works/a\n",
        };
      }
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
      return {
        stdout: "",
      };
    };
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    await Promise.all([
      adapter.fetch(),
      adapter.push("works/a"),
      adapter.deleteBranch("works/a"),
      adapter.pullRoot(),
      adapter.fetch(),
    ]);
    assert.equal(most, 1);
  });

  test("a failed call does not block the next one", async () => {
    const run = async (command, args) => {
      if (args[0] === "fetch") {
        throw Object.assign(new Error("fatal: cannot lock ref"), {
          code: 1,
        });
      }
      return {
        stdout: "",
      };
    };
    const adapter = createGitAdapter({
      baseDir: "/base",
      run,
    });
    await assert.rejects(adapter.fetch(), /cannot lock ref/);
    await adapter.pullRoot();
  });
});
