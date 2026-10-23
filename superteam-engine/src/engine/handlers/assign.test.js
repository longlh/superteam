import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { readJson, writeJson } from "../../lib/storage/files.js";
import { errorFile, workFile, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { createBranchNames } from "../../lib/storage/branches.js";
import { createEngineHandlers } from "./index.js";
import { startReady } from "./start-ready.js";

const now = new Date("2026-01-02T03:04:05.000Z");
const linear = {
  name: "linear",
  title: "Linear",
  dod: ["wf dod"],
  steps: [
    {
      name: "a",
      role: "dev",
    },
    {
      name: "b",
      role: "qa",
      dependOn: ["a"],
    },
  ],
};
const fan = {
  name: "fan",
  title: "Fan",
  steps: [
    {
      name: "a",
      role: "dev",
    },
    {
      name: "b",
      role: "dev",
    },
    {
      name: "c",
      role: "dev",
      dependOn: ["a", "b"],
    },
  ],
};
// Changed on disk after the assign was accepted: a step has lost its role.
const broken = {
  name: "broken",
  title: "Broken",
  steps: [
    {
      name: "a",
    },
  ],
};
const workflows = {
  linear,
  fan,
  broken,
};

let baseDir;
let calls;
let published;
let handlers;

function fakeGit() {
  return {
    async fetch() {
      calls.push(["fetch"]);
    },
    async createWorktree(args) {
      if (existsSync(args.folder)) {
        return;
      }
      calls.push(["createWorktree", args]);
      await mkdir(args.folder, {
        recursive: true,
      });
    },
    async commitAll(folder, message) {
      calls.push(["commitAll", folder, message]);
      return true;
    },
  };
}

// The function `assign` puts the upstream it checked in the event, as `base`.
function event(data) {
  return {
    type: "work:assign",
    payload: {
      data: {
        base: "main",
        ...data,
      },
    },
  };
}

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), "assign-"));
  calls = [];
  published = [];
  handlers = createEngineHandlers({
    baseDir,
    branches: createBranchNames(),
    git: fakeGit(),
    loadWorkflow: async (name) => workflows[name] ?? null,
    publish: (topic, data) => published.push([topic, data]),
    now: () => now,
  });
});

afterEach(() =>
  rm(baseDir, {
    recursive: true,
    force: true,
  }),
);

const created = () => calls.filter(([name]) => name === "createWorktree");

test("assign creates the work worktree, the work file, the tasks and one job", async () => {
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "Title",
    }),
  );
  const workTree = worktreeDir(baseDir, {
    workId: "w1",
  });
  assert.deepEqual(created()[0][1], {
    folder: workTree,
    branch: "superteam-work/w1",
    base: "origin/main",
  });
  assert.deepEqual(await readJson(workFile(workTree, "w1")), {
    id: "w1",
    workflow: "linear",
    base: "main",
    title: "Title",
    dod: ["wf dod"],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  assert.deepEqual(calls.find(([name]) => name === "commitAll").slice(1), [
    workTree,
    "Assign the work w1",
  ]);
  const tasks = await createTaskStore(workTree).list();
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["a", "b"],
  );
  assert.equal(published.length, 1);
  const [topic, job] = published[0];
  assert.equal(topic, "job:run");
  assert.equal(job.role, "dev");
  assert.equal(job.instruction.target, "task");
  assert.deepEqual(job.instruction.targetIds, ["a"]);
  assert.equal(
    job.workdir,
    worktreeDir(baseDir, {
      workId: "w1",
      taskId: "a",
    }),
  );
  assert.deepEqual(created()[1][1], {
    folder: job.workdir,
    branch: "superteam-task/w1/a",
    base: "superteam-work/w1",
  });
});

test("the dod and description of the body win over the workflow", async () => {
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "T",
      description: "D",
      dod: ["mine"],
    }),
  );
  const work = await readJson(
    workFile(
      worktreeDir(baseDir, {
        workId: "w1",
      }),
      "w1",
    ),
  );
  assert.deepEqual(work.dod, ["mine"]);
  assert.equal(work.description, "D");
});

test("a step with two dependencies starts a task merger first", async () => {
  await handlers["work:assign"](
    event({
      id: "w2",
      workflow: "fan",
      title: "T",
    }),
  );
  assert.deepEqual(
    published.map(([, job]) => job.instruction.target),
    ["task", "task"],
  );
  // c is PENDING until a and b are done, so no merger yet.
  const workTree = worktreeDir(baseDir, {
    workId: "w2",
  });
  const store = createTaskStore(workTree);
  for (const id of ["a", "b"]) {
    await store.put({
      ...(await store.get(id)),
      completed: true,
    });
  }
  published.length = 0;
  await startReady({
    deps: {
      baseDir,
      branches: createBranchNames(),
      git: fakeGit(),
      publish: (topic, data) => published.push([topic, data]),
      now: () => now,
    },
    workId: "w2",
  });
  assert.equal(published.length, 1);
  const job = published[0][1];
  assert.equal(job.role, "task-merger");
  assert.deepEqual(job.instruction.targetIds, ["b"]);
  assert.deepEqual(created().at(-1)[1], {
    folder: job.workdir,
    branch: "superteam-task/w2/c",
    base: "superteam-task/w2/a",
  });
});

test("handling the same event twice changes nothing", async () => {
  const e = event({
    id: "w1",
    workflow: "linear",
    title: "T",
  });
  await handlers["work:assign"](e);
  await handlers["work:assign"](e);
  assert.equal(created().length, 2);
  assert.equal(published.length, 1);
  assert.equal(
    (
      await readdir(
        path.join(
          worktreeDir(baseDir, {
            workId: "w1",
          }),
          ".superteam",
          ".p",
          "works",
        ),
      )
    ).length,
    1,
  );
});

test("two events with the same id create the work once", async () => {
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "First",
    }),
  );
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "Second",
    }),
  );
  const work = await readJson(
    workFile(
      worktreeDir(baseDir, {
        workId: "w1",
      }),
      "w1",
    ),
  );
  assert.equal(work.title, "First");
  assert.equal(published.length, 1);
});

test("a crash after the work file and before the tasks is repaired", async () => {
  const e = event({
    id: "w1",
    workflow: "linear",
    title: "T",
  });
  await handlers["work:assign"](e);
  const workTree = worktreeDir(baseDir, {
    workId: "w1",
  });
  await rm(path.join(workTree, ".superteam", ".r"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(baseDir, ".superteam", ".r", "worktrees", "tasks"), {
    recursive: true,
    force: true,
  });
  await mkdir(workTree, {
    recursive: true,
  });
  published.length = 0;
  calls.length = 0;
  await handlers["work:assign"](e);
  assert.equal((await createTaskStore(workTree).list()).length, 2);
  assert.equal(published.length, 1);
  assert.equal(
    created().filter(([, args]) => args.folder === workTree).length,
    0,
  );
});

test("a half-written task set gets its missing task and keeps the other", async () => {
  const e = event({
    id: "w1",
    workflow: "linear",
    title: "T",
  });
  await handlers["work:assign"](e);
  const workTree = worktreeDir(baseDir, {
    workId: "w1",
  });
  const store = createTaskStore(workTree);
  const a = {
    ...(await store.get("a")),
    summary: "kept",
  };
  await store.put(a);
  await rm(path.join(workTree, ".superteam", ".r", "tasks", "b.json"));
  await handlers["work:assign"](e);
  assert.deepEqual(await store.get("a"), a);
  assert.equal((await store.get("b")).id, "b");
});

test("an unknown workflow throws a non retryable error", async () => {
  await assert.rejects(
    handlers["work:assign"](
      event({
        id: "w1",
        workflow: "nope",
        title: "T",
      }),
    ),
    (error) => error.retryable === false,
  );
  assert.deepEqual(calls, [["fetch"]]);
});

test("a workflow that is not valid any more throws a non retryable error", async () => {
  await assert.rejects(
    handlers["work:assign"](
      event({
        id: "w1",
        workflow: "broken",
        title: "T",
      }),
    ),
    (error) =>
      error.retryable === false &&
      /workflow broken: step a: role must be a slug/.test(error.message),
  );
  assert.deepEqual(calls, [["fetch"]]);
});

test("an event with no base throws a non retryable error", async () => {
  await assert.rejects(
    handlers["work:assign"](
      event({
        id: "w1",
        workflow: "linear",
        title: "T",
        base: undefined,
      }),
    ),
    (error) => error.retryable === false && /has no base/.test(error.message),
  );
  assert.deepEqual(calls, [["fetch"]]);
});

test("the worktree is based on the base of the event, a branch of origin", async () => {
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "T",
      base: "develop",
    }),
  );
  assert.equal(created()[0][1].base, "origin/develop");
});

test("a retry keeps the base of the work that is already written", async () => {
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "T",
    }),
  );
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "T",
      base: "develop",
    }),
  );
  const work = await readJson(
    workFile(
      worktreeDir(baseDir, {
        workId: "w1",
      }),
      "w1",
    ),
  );
  assert.equal(work.base, "main");
});

test("an assign removes an error left by a work of the same id that was never created", async () => {
  await writeJson(errorFile(baseDir, "w1"), {
    error: "offline",
    retryable: true,
  });
  await handlers["work:assign"](
    event({
      id: "w1",
      workflow: "linear",
      title: "T",
    }),
  );
  assert.equal(existsSync(errorFile(baseDir, "w1")), false);
});
