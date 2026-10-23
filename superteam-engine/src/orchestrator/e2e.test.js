import assert from "node:assert/strict";
import { execFile, spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createFakeGh } from "../../../test/fixtures/fake-gh.js";
import { createAgents } from "../agents/index.js";
import { createGitAdapter } from "../engine/git-adapter.js";
import { createEngine } from "../engine/index.js";
import { readJson } from "../lib/storage/files.js";
import { agentsDir, workFile, worktreeDir } from "../lib/storage/paths.js";
import { createHttpApi } from "./http-api.js";
import { createOrchestrator } from "./index.js";

const execFileAsync = promisify(execFile);

const FAKE_CLAUDE = fileURLToPath(
  new URL("../../../test/fixtures/fake-claude.js", import.meta.url),
);
const DOD = ["The feature works", "The feature is tested"];
const WORKFLOW = {
  name: "build",
  title: "Build a feature",
  steps: [
    {
      name: "a",
      role: "developer",
      instruction: "Write the part a.",
    },
    {
      name: "b",
      role: "developer",
      instruction: "Write the part b.",
    },
    {
      name: "c",
      role: "tester",
      instruction: "Test the parts a and b.",
      dependOn: ["a", "b"],
    },
  ],
};

const git = (cwd, args) =>
  execFileAsync("git", args, {
    cwd,
  });

// A root workspace as the Seed Skill leaves it, with a bare `origin` whose
// default branch is `main`. With another `rootBranch`, the root workspace is on
// that branch, pushed to `origin` as its `upstream`, which can have another
// name.
async function createProject(
  t,
  { rootBranch = "main", upstream = rootBranch } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "superteam-e2e-"));
  // The stacks are shut down first, in the reverse order of their start.
  const cleanups = [];
  // Each one runs even when one before it fails, and the folder is always
  // removed; the first failure is thrown at the end.
  t.after(async () => {
    const failures = [];
    try {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  });
  const origin = path.join(root, "origin.git");
  const baseDir = path.join(root, "project");
  await git(root, ["init", "--bare", "-b", "main", origin]);
  await mkdir(baseDir);
  await git(baseDir, ["init", "-b", "main"]);
  await git(baseDir, ["config", "user.name", "Superteam Test"]);
  await git(baseDir, ["config", "user.email", "test@example.com"]);
  await git(baseDir, ["config", "commit.gpgsign", "false"]);
  await writeFile(
    path.join(baseDir, ".gitignore"),
    ".superteam/.r/\n.superteam/.env\n",
  );
  const workflows = path.join(baseDir, ".superteam", ".p", "workflows");
  await mkdir(workflows, {
    recursive: true,
  });
  await writeFile(
    path.join(workflows, "build.json"),
    `${JSON.stringify(WORKFLOW, null, 2)}\n`,
  );
  // The agent files of the roles, committed so every worktree has them.
  const roles = path.join(baseDir, ".claude", "agents");
  await mkdir(roles, {
    recursive: true,
  });
  for (const role of ["developer", "tester"]) {
    await writeFile(
      path.join(roles, `${role}.md`),
      `---\nname: ${role}\ntools: Bash, Read, Write, Edit, StructuredOutput\n---\n\nYou are the ${role}.\n`,
    );
  }
  await git(baseDir, ["add", "-A"]);
  await git(baseDir, ["commit", "-m", "Seed superteam"]);
  await git(baseDir, ["remote", "add", "origin", origin]);
  await git(baseDir, ["push", "--set-upstream", "origin", "main"]);
  if (rootBranch !== "main") {
    await git(baseDir, ["checkout", "-q", "-b", rootBranch]);
    await git(baseDir, [
      "push",
      "--set-upstream",
      "origin",
      `${rootBranch}:${upstream}`,
    ]);
  }
  return {
    baseDir,
    origin,
    cleanups,
    run: createFakeGh({
      baseDir,
    }),
  };
}

// The whole stack on port 0, with the fake claude and the fake gh. The pid of
// the last agent of each folder is kept by the name of the folder, and its
// shutdown checks that no agent it spawned is left.
async function startStack(project, modes = {}) {
  const { baseDir } = project;
  const git = createGitAdapter({
    baseDir,
    run: project.run,
  });
  const engine = createEngine({
    baseDir,
    git,
    loopOptions: {
      pollIntervalMs: 20,
    },
  });
  const pids = new Map();
  const spawned = [];
  const agents = createAgents({
    baseDir,
    command: FAKE_CLAUDE,
    env: {
      FAKE_CLAUDE_MODES: JSON.stringify(modes),
    },
    spawn: (command, args, options) => {
      const child = nodeSpawn(command, args, options);
      pids.set(path.basename(options.cwd), child.pid);
      spawned.push(child.pid);
      return child;
    },
  });
  const api = createHttpApi({
    engine,
  });
  let port;
  const orchestrator = createOrchestrator({
    baseDir,
    port: 0,
    engine,
    agents,
    git,
    httpApi: {
      async listen(wanted) {
        const address = await api.listen(wanted);
        port = address.port;
        return address;
      },
      close: () => api.close(),
    },
  });
  await orchestrator.start();
  let stopped = false;
  const shutdown = async () => {
    if (!stopped) {
      stopped = true;
      await orchestrator.shutdown();
      await waitFor(
        () => !spawned.some(alive),
        "every agent is stopped after the shutdown",
      );
    }
  };
  project.cleanups.push(shutdown);

  async function request(method, route, body) {
    // As the MCP client: every POST says it is JSON, even with no body.
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      ...(method === "POST"
        ? {
            headers: {
              "content-type": "application/json",
            },
          }
        : {}),
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }

  return {
    request,
    pids,
    shutdown,
  };
}

async function waitFor(check, message, ms = 20000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out after ${ms} ms: ${message}`);
}

async function waitForWork(stack, id, check, message) {
  let last;
  try {
    return await waitFor(async () => {
      const { status, body } = await stack.request("GET", `/works/${id}`);
      last = body;
      return status === 200 && check(body) && body;
    }, message);
  } catch (error) {
    error.message += `; last state: ${JSON.stringify(last)}`;
    throw error;
  }
}

async function remoteBranches(origin) {
  const { stdout } = await git(origin, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/",
  ]);
  return stdout.split("\n").filter((name) => name !== "");
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const pidFiles = async (baseDir) =>
  (await readdir(agentsDir(baseDir)).catch(() => [])).filter((name) =>
    name.endsWith(".pid"),
  );

async function assign(stack, id) {
  const { status, body } = await stack.request("POST", "/works", {
    workflow: "build",
    title: `The work ${id}`,
    id,
    dod: DOD,
  });
  assert.equal(status, 202);
  assert.equal(body.id, id);
}

const listed = async (stack, id) =>
  (await stack.request("GET", "/works")).body.some((work) => work.id === id);

// A file of a branch on `origin`, or null when it is not there.
async function onOrigin(origin, branch, file) {
  try {
    return (await git(origin, ["show", `${branch}:${file}`])).stdout;
  } catch {
    return null;
  }
}

async function approve(stack, id) {
  const decided = await stack.request("POST", `/works/${id}/decision`, {
    decision: "approve",
  });
  assert.equal(decided.status, 202);
}

test("a work is assigned, run, proposed and approved", async (t) => {
  const project = await createProject(t);
  const { baseDir, origin } = project;
  const stack = await startStack(project);

  await assign(stack, "first");
  const proposed = await waitForWork(
    stack,
    "first",
    (work) => work.status === "DONE" && work.approvalStatus === "PROPOSED",
    "the work first is PROPOSED",
  );
  assert.equal(typeof proposed.pullRequest, "string");

  const decided = await stack.request("POST", "/works/first/decision", {
    decision: "approve",
  });
  assert.equal(decided.status, 202);
  await waitForWork(
    stack,
    "first",
    (work) => work.approvalStatus === "APPROVED",
    "the work first is APPROVED",
  );
  // The merge makes it APPROVED; the fetch and the deletes come after it.
  await waitFor(
    async () => (await remoteBranches(origin)).join() === "main",
    "the branches of first are deleted from origin",
  );

  const work = JSON.parse(
    await onOrigin(origin, "main", ".superteam/.p/works/first.json"),
  );
  assert.equal(work.id, "first");
  assert.equal(work.base, "main");
  assert.deepEqual(work.dod, DOD);
  assert.deepEqual(work.dodChecklist, [true, true]);
  for (const file of ["developer-a.txt", "developer-b.txt", "tester-c.txt"]) {
    assert.notEqual(await onOrigin(origin, "main", file), null, file);
  }
  // The root workspace is not pulled: the person pulls it.
  assert.equal(existsSync(workFile(baseDir, "first")), false);
  assert.ok(await listed(stack, "first"), "the work first is listed");
  assert.deepEqual(await remoteBranches(origin), ["main"]);
});

test("a commit of the root branch that is not pushed stays out of the work, and the root workspace is not changed", async (t) => {
  const project = await createProject(t);
  const { baseDir, origin } = project;
  await writeFile(path.join(baseDir, "local.txt"), "not pushed\n");
  await git(baseDir, ["add", "local.txt"]);
  await git(baseDir, ["commit", "-m", "Not pushed"]);
  const head = (await git(baseDir, ["rev-parse", "HEAD"])).stdout;
  const stack = await startStack(project);

  await assign(stack, "clean");
  await waitForWork(
    stack,
    "clean",
    (work) => work.approvalStatus === "PROPOSED",
    "the work clean is PROPOSED",
  );
  await approve(stack, "clean");
  await waitFor(
    async () => (await remoteBranches(origin)).join() === "main",
    "the branches of clean are deleted from origin",
  );

  assert.equal(
    JSON.parse(await onOrigin(origin, "main", ".superteam/.p/works/clean.json"))
      .id,
    "clean",
  );
  assert.equal(await onOrigin(origin, "main", "local.txt"), null);
  assert.equal((await git(baseDir, ["rev-parse", "HEAD"])).stdout, head);
  assert.equal(existsSync(workFile(baseDir, "clean")), false);
  const state = await waitForWork(
    stack,
    "clean",
    (work) => work.approvalStatus === "APPROVED",
    "the work clean is APPROVED",
  );
  assert.equal(state.status, "DONE");
  assert.ok(await listed(stack, "clean"), "the work clean is listed");
});

test("an approved work lands on the upstream of the root branch, not on the default branch", async (t) => {
  const project = await createProject(t, {
    rootBranch: "dev",
    upstream: "develop",
  });
  const { baseDir, origin } = project;
  const stack = await startStack(project);

  await assign(stack, "on-develop");
  await waitForWork(
    stack,
    "on-develop",
    (work) => work.approvalStatus === "PROPOSED",
    "the work on-develop is PROPOSED",
  );
  await approve(stack, "on-develop");
  await waitFor(
    async () => (await remoteBranches(origin)).join() === "develop,main",
    "the branches of on-develop are deleted from origin",
  );
  const file = ".superteam/.p/works/on-develop.json";
  assert.equal(
    JSON.parse(await onOrigin(origin, "develop", file)).base,
    "develop",
  );
  assert.equal(await onOrigin(origin, "main", file), null);
  // A person switches the root workspace to main: the work is still listed.
  await git(baseDir, ["checkout", "-q", "main"]);
  const state = await waitForWork(
    stack,
    "on-develop",
    (work) => work.approvalStatus === "APPROVED",
    "the work on-develop is APPROVED",
  );
  assert.equal(state.status, "DONE");
  assert.ok(await listed(stack, "on-develop"), "the work is listed");
});

test("a rejected work keeps its branch until it is archived", async (t) => {
  const project = await createProject(t);
  const { origin } = project;
  const stack = await startStack(project);

  await assign(stack, "second");
  await waitForWork(
    stack,
    "second",
    (work) => work.approvalStatus === "PROPOSED",
    "the work second is PROPOSED",
  );
  const decided = await stack.request("POST", "/works/second/decision", {
    decision: "reject",
  });
  assert.equal(decided.status, 202);
  await waitForWork(
    stack,
    "second",
    (work) => work.approvalStatus === "REJECTED",
    "the work second is REJECTED",
  );
  await waitFor(async () => {
    const branches = await remoteBranches(origin);
    return !branches.some((name) => name.startsWith("superteam-task/second/"));
  }, "the task branches of second are deleted");
  assert.deepEqual(await remoteBranches(origin), [
    "main",
    "superteam-work/second",
  ]);

  const archived = await stack.request("POST", "/works/second/archive");
  assert.equal(archived.status, 202);
  await waitFor(
    async () => (await remoteBranches(origin)).join() === "main",
    "the branch works/second is deleted from origin",
  );
  assert.equal(await listed(stack, "second"), false);
});

test("a failed task fails the work and stops its other job", async (t) => {
  const project = await createProject(t);
  const { baseDir, origin } = project;
  const stack = await startStack(project, {
    a: "hang",
    b: "fail",
  });

  await assign(stack, "third");
  const failed = await waitForWork(
    stack,
    "third",
    (work) => work.status === "FAILED",
    "the work third is FAILED",
  );
  assert.equal(typeof failed.error, "string");
  assert.equal(failed.approvalStatus, "DRAFT");

  const pid = stack.pids.get("a");
  assert.equal(typeof pid, "number");
  await waitFor(() => !alive(pid), "the job of the task a is stopped");
  await waitFor(
    async () => (await pidFiles(baseDir)).length === 0,
    "no pid file is left",
  );
  await waitFor(
    async () =>
      !existsSync(
        worktreeDir(baseDir, {
          workId: "third",
        }),
      ),
    "the worktree of third is removed",
  );
  assert.deepEqual(await remoteBranches(origin), [
    "main",
    "superteam-work/third",
  ]);

  const archived = await stack.request("POST", "/works/third/archive");
  assert.equal(archived.status, 202);
  await waitFor(
    async () => (await remoteBranches(origin)).join() === "main",
    "the branch works/third is deleted from origin",
  );
  assert.equal(await listed(stack, "third"), false);
});

test("a job stopped by a shutdown fails its work at the next start", async (t) => {
  const project = await createProject(t);
  const { baseDir } = project;
  const first = await startStack(project, {
    a: "hang",
  });

  await assign(first, "fourth");
  await waitFor(async () => {
    for (const name of await pidFiles(baseDir)) {
      const content = await readJson(path.join(agentsDir(baseDir), name));
      if (content?.job?.id === "fourth/a/worker") {
        return true;
      }
    }
    return false;
  }, "the job of the task a runs");
  const workFolder = worktreeDir(baseDir, {
    workId: "fourth",
  });
  await waitFor(
    async () =>
      (
        await readJson(
          path.join(workFolder, ".superteam", ".r", "tasks", "b.json"),
        )
      )?.completed === true,
    "the task b is completed",
  );
  await first.shutdown();
  assert.equal(alive(first.pids.get("a")), false);

  const second = await startStack(project);
  const failed = await waitForWork(
    second,
    "fourth",
    (work) => work.status === "FAILED",
    "the work fourth is FAILED after the restart",
  );
  assert.equal(failed.error, "the agent was killed");
});

test("the API refuses what the spec refuses", async (t) => {
  const project = await createProject(t);
  const stack = await startStack(project, {
    a: "hang",
  });

  const unknown = await stack.request("POST", "/works", {
    workflow: "missing",
    title: "No workflow",
  });
  assert.equal(unknown.status, 404);

  await assign(stack, "fifth");
  await waitForWork(
    stack,
    "fifth",
    (work) => work.status === "IN_PROGRESS",
    "the work fifth is IN_PROGRESS",
  );
  const repeated = await stack.request("POST", "/works", {
    workflow: "build",
    title: "The same id",
    id: "fifth",
  });
  assert.equal(repeated.status, 409);

  const early = await stack.request("POST", "/works/fifth/decision", {
    decision: "approve",
  });
  assert.equal(early.status, 409);
});
