import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { waitFor } from "../lib/engineloop/testkit.js";
import { writeJson } from "../lib/storage/files.js";
import { isSlug } from "../lib/storage/ids.js";
import { workFile, workflowFile, worktreeDir } from "../lib/storage/paths.js";
import { EngineError } from "./errors.js";
import { createHarness } from "./handlers/harness.js";
import { createEngine } from "./index.js";
import { createTaskStore } from "./tasks.js";

const KILLED = "the agent was killed";
const flow = {
  name: "flow",
  title: "Flow",
  steps: [
    {
      name: "build",
      role: "developer",
    },
  ],
};

let h;
let engine;
let running;
let gitLog;
let extraBranches;
let notes;
let logs;

beforeEach(async () => {
  h = await createHarness({});
  extraBranches = new Set();
  const { branchExists, listBranches } = h.git;
  h.git.branchExists = async (branch) =>
    extraBranches.has(branch) || branchExists(branch);
  h.git.listBranches = async (prefix) =>
    [
      ...new Set([
        ...(await listBranches(prefix)),
        ...[...extraBranches].filter((b) => b.startsWith(prefix)),
      ]),
    ].sort();
  h.git.fetch = async () => {};
  gitLog = [];
  for (const [name, fn] of Object.entries(h.git)) {
    h.git[name] = (...args) => {
      gitLog.push(name);
      return fn(...args);
    };
  }
  logs = [];
  engine = createEngine({
    baseDir: h.baseDir,
    git: h.git,
    log: (message) => logs.push(message),
    loopOptions: {
      pollIntervalMs: 5,
      maxAttempts: 2,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, 5)),
    },
  });
  notes = [];
  for (const topic of [
    "engine:ready",
    "event:done",
    "event:retry",
    "event:error",
    "job:run",
    "job:stop",
  ]) {
    engine.subscribe(topic, (data) => notes.push([topic, data]));
  }
  running = undefined;
});

afterEach(async () => {
  if (running) {
    engine.shutdown();
    await running;
  }
  await h.cleanup();
});

async function start() {
  const ready = new Promise((resolve) =>
    engine.subscribe("engine:ready", resolve),
  );
  running = engine.start();
  await ready;
}

const code = (expected) => (error) =>
  error instanceof EngineError && error.code === expected;

const saveWorkflow = (workflow) =>
  writeJson(workflowFile(h.baseDir, workflow.name), workflow);

const work = (id, extra = {}) => ({
  id,
  workflow: "flow",
  title: `Title ${id}`,
  dod: [],
  ...extra,
});

const task = (workId, id, extra = {}) => ({
  id,
  title: id,
  assignee: "developer",
  timeout: 720,
  dependOn: [],
  dod: [],
  instruction: "",
  description: "",
  work: workId,
  ...extra,
});

async function inWorktree(entity, tasks = []) {
  const folder = worktreeDir(h.baseDir, {
    workId: entity.id,
  });
  await writeJson(workFile(folder, entity.id), entity);
  for (const t of tasks) {
    await createTaskStore(folder).put(t);
  }
}

const taskFolder = (workId, taskId) =>
  mkdir(
    worktreeDir(h.baseDir, {
      workId,
      taskId,
    }),
    {
      recursive: true,
    },
  );

function onBranch(entity) {
  extraBranches.add(`works/${entity.id}`);
  h.branchFiles.set(
    `works/${entity.id}:.superteam/.p/works/${entity.id}.json`,
    JSON.stringify(entity),
  );
}

const inRoot = (entity) => writeJson(workFile(h.baseDir, entity.id), entity);

const pullRequest = (id, state) =>
  h.pullRequests.set(`works/${id}`, {
    url: `https://example.test/works/${id}`,
    state,
  });

const done = (type) =>
  notes
    .filter(([topic]) => topic === "event:done")
    .map(([, data]) => data.event.payload)
    .filter((payload) => payload.type === type);

const body = (extra = {}) => ({
  workflow: "flow",
  title: "Add the login page",
  ...extra,
});

test("every function that enqueues is unavailable before the loop is ready", async () => {
  await saveWorkflow(flow);
  await assert.rejects(engine.assign(body()), code("unavailable"));
  await assert.rejects(engine.decide("w1", "approve"), code("unavailable"));
  await assert.rejects(engine.archive("w1"), code("unavailable"));
  await assert.rejects(
    engine.jobEnded({
      id: "w1/a/worker",
    }),
    code("unavailable"),
  );
  await assert.rejects(engine.reconcile([]), code("unavailable"));
});

test("assign refuses an id that is not a slug, and never reaches git", async () => {
  await saveWorkflow(flow);
  await start();
  for (const id of [
    "Add-Login",
    "add login",
    "a/b",
    "..",
    "../x",
    "a".repeat(64),
  ]) {
    await assert.rejects(
      engine.assign(
        body({
          id,
        }),
      ),
      code("invalid"),
    );
  }
  assert.deepEqual(gitLog, []);
});

test("assign refuses a body with no title", async () => {
  await saveWorkflow(flow);
  await start();
  await assert.rejects(
    engine.assign({
      workflow: "flow",
    }),
    code("invalid"),
  );
});

test("assign refuses an unknown workflow with not-found", async () => {
  await start();
  await assert.rejects(engine.assign(body()), code("not-found"));
});

test("assign refuses a workflow that could never finish", async () => {
  await start();
  const workflows = [
    {
      name: "empty",
      title: "No step",
      steps: [],
    },
    {
      name: "unknown",
      title: "Unknown dependency",
      steps: [
        {
          name: "a",
          role: "developer",
          dependOn: ["b"],
        },
      ],
    },
    {
      name: "cycle",
      title: "Cycle",
      steps: [
        {
          name: "a",
          role: "developer",
          dependOn: ["b"],
        },
        {
          name: "b",
          role: "developer",
          dependOn: ["a"],
        },
      ],
    },
  ];
  for (const workflow of workflows) {
    await saveWorkflow(workflow);
    await assert.rejects(
      engine.assign(
        body({
          workflow: workflow.name,
        }),
      ),
      (error) =>
        code("invalid")(error) &&
        /no step|non-empty|unknown step|cycle/.test(error.message),
    );
  }
});

test("assign refuses an id that is used by a branch, a root work file or a pull request", async () => {
  await saveWorkflow(flow);
  await start();
  extraBranches.add("works/on-branch");
  await inRoot(work("in-root"));
  pullRequest("with-pr", "closed");
  for (const id of ["on-branch", "in-root", "with-pr"]) {
    await assert.rejects(
      engine.assign(
        body({
          id,
        }),
      ),
      code("conflict"),
    );
  }
});

test("assign enqueues work:assign with the given id, and the work runs", async () => {
  await saveWorkflow(flow);
  await start();
  const result = await engine.assign(
    body({
      id: "add-login",
    }),
  );
  assert.equal(result.id, "add-login");
  assert.equal(typeof result.eventId, "string");
  await waitFor(() => done("work:assign").length === 1, "work:assign");
  assert.deepEqual(
    done("work:assign")[0].data,
    body({
      id: "add-login",
    }),
  );
  const jobs = notes.filter(([topic]) => topic === "job:run");
  assert.deepEqual(
    jobs.map(([, job]) => job.id),
    ["add-login/build/worker"],
  );
  const state = await engine.getWork("add-login");
  assert.equal(state.status, "IN_PROGRESS");
  assert.equal(state.approvalStatus, "DRAFT");
});

test("assign creates a new slug when the body has no id", async () => {
  await saveWorkflow(flow);
  await start();
  const { id, eventId } = await engine.assign(body());
  assert.ok(isSlug(id));
  assert.equal(id.length, 8);
  assert.equal(typeof eventId, "string");
  await waitFor(() => done("work:assign").length === 1, "work:assign");
  assert.equal(done("work:assign")[0].data.id, id);
});

test("decide refuses an invalid id or decision, and an unknown work", async () => {
  await start();
  await assert.rejects(engine.decide("../x", "approve"), code("invalid"));
  await assert.rejects(engine.decide("w1", "maybe"), code("invalid"));
  await assert.rejects(engine.decide("w1", "approve"), code("not-found"));
});

test("decide refuses a work whose pull request is not open", async () => {
  await start();
  onBranch(work("no-pr"));
  onBranch(work("closed"));
  pullRequest("closed", "closed");
  await assert.rejects(engine.decide("no-pr", "approve"), code("conflict"));
  await assert.rejects(engine.decide("closed", "reject"), code("conflict"));
});

test("decide enqueues work:decide for a work whose pull request is open", async () => {
  await start();
  onBranch(work("w1"));
  pullRequest("w1", "open");
  const { eventId } = await engine.decide("w1", "reject");
  assert.equal(typeof eventId, "string");
  await waitFor(() => done("work:decide").length === 1, "work:decide");
  assert.deepEqual(done("work:decide")[0].data, {
    id: "w1",
    decision: "reject",
  });
});

test("archive refuses an id that is not a slug, and never reaches git", async () => {
  await start();
  await assert.rejects(engine.archive("../x"), code("invalid"));
  assert.deepEqual(gitLog, []);
});

test("archive refuses an unknown work, and a work that is not failed or rejected", async () => {
  await start();
  await assert.rejects(engine.archive("w1"), code("not-found"));
  onBranch(work("draft"));
  onBranch(work("proposed"));
  pullRequest("proposed", "open");
  await assert.rejects(engine.archive("draft"), code("conflict"));
  await assert.rejects(engine.archive("proposed"), code("conflict"));
});

test("archive enqueues work:archive for a failed or a rejected work", async () => {
  await start();
  onBranch(
    work("failed", {
      error: "boom",
    }),
  );
  onBranch(work("rejected"));
  pullRequest("rejected", "closed");
  for (const id of ["failed", "rejected"]) {
    const { eventId } = await engine.archive(id);
    assert.equal(typeof eventId, "string");
  }
  await waitFor(() => done("work:archive").length === 2, "work:archive");
  assert.deepEqual(
    done("work:archive").map((payload) => payload.data),
    [
      {
        id: "failed",
      },
      {
        id: "rejected",
      },
    ],
  );
});

test("getWork fetches first, then reads the worktree before the branch", async () => {
  await inWorktree(work("w1"), [
    task("w1", "a", {
      completed: true,
    }),
    task("w1", "b", {
      dependOn: ["a"],
    }),
  ]);
  onBranch(
    work("w1", {
      title: "Old title",
    }),
  );
  assert.deepEqual(await engine.getWork("w1"), {
    id: "w1",
    title: "Title w1",
    workflow: "flow",
    status: "IN_PROGRESS",
    approvalStatus: "DRAFT",
  });
  assert.equal(gitLog[0], "fetch");
  assert.equal(gitLog.filter((name) => name === "fetch").length, 1);
});

test("getWork gives OPEN for a work in its worktree with no task", async () => {
  await inWorktree(work("w1"));
  assert.equal((await engine.getWork("w1")).status, "OPEN");
});

test("getWork reads a failed or a rejected work from its branch", async () => {
  onBranch(
    work("failed", {
      error: "boom",
    }),
  );
  onBranch(work("rejected"));
  pullRequest("rejected", "closed");
  assert.deepEqual(await engine.getWork("failed"), {
    id: "failed",
    title: "Title failed",
    workflow: "flow",
    status: "FAILED",
    approvalStatus: "DRAFT",
    error: "boom",
  });
  assert.deepEqual(await engine.getWork("rejected"), {
    id: "rejected",
    title: "Title rejected",
    workflow: "flow",
    status: "DONE",
    approvalStatus: "REJECTED",
    pullRequest: "https://example.test/works/rejected",
  });
});

test("getWork reads an approved work from the root workspace", async () => {
  await inRoot(work("w1"));
  pullRequest("w1", "merged");
  assert.deepEqual(await engine.getWork("w1"), {
    id: "w1",
    title: "Title w1",
    workflow: "flow",
    status: "DONE",
    approvalStatus: "APPROVED",
    pullRequest: "https://example.test/works/w1",
  });
});

test("getWork treats a corrupt work file on the branch as not found there", async () => {
  extraBranches.add("works/w1");
  h.branchFiles.set("works/w1:.superteam/.p/works/w1.json", "{ not json");
  await assert.rejects(engine.getWork("w1"), code("not-found"));
  await inRoot(work("w1"));
  assert.equal((await engine.getWork("w1")).approvalStatus, "APPROVED");
});

test("getWork gives not-found for an unknown id, and for an id that is not a slug", async () => {
  await assert.rejects(engine.getWork("w1"), code("not-found"));
  gitLog.length = 0;
  await assert.rejects(engine.getWork("../w1"), code("not-found"));
  assert.deepEqual(gitLog, []);
});

test("listWorks merges the three sources with no duplicate, the first source winning", async () => {
  await inWorktree(work("w1"));
  onBranch(
    work("w1", {
      title: "Old title",
    }),
  );
  onBranch(
    work("w2", {
      error: "boom",
    }),
  );
  onBranch(
    work("w3", {
      title: "Branch title",
    }),
  );
  pullRequest("w3", "merged");
  await inRoot(
    work("w3", {
      title: "Root title",
    }),
  );
  extraBranches.add("works/w4");
  await inRoot(work("w5"));
  const works = await engine.listWorks();
  assert.deepEqual(
    works.map(({ id, title, status, approvalStatus }) => [
      id,
      title,
      status,
      approvalStatus,
    ]),
    [
      ["w1", "Title w1", "OPEN", "DRAFT"],
      ["w2", "Title w2", "FAILED", "DRAFT"],
      ["w3", "Branch title", "DONE", "APPROVED"],
      ["w5", "Title w5", "DONE", "APPROVED"],
    ],
  );
  assert.equal(gitLog[0], "fetch");
  assert.equal(gitLog.filter((name) => name === "fetch").length, 1);
});

test("jobEnded enqueues the ended event of the kind of the job id", async () => {
  await start();
  const ends = [
    ["w1/a/worker", "worker:ended"],
    ["w1/b/task-merger", "task-merger:ended"],
    ["w1/work-merger", "work-merger:ended"],
  ];
  for (const [id] of ends) {
    await engine.jobEnded({
      id,
      summary: "s",
      data: {
        x: 1,
      },
    });
  }
  await waitFor(
    () => ends.every(([, type]) => done(type).length === 1),
    "the ended events",
  );
  for (const [id, type] of ends) {
    assert.deepEqual(done(type)[0].data, {
      jobId: id,
      summary: "s",
      data: {
        x: 1,
      },
    });
  }
});

test("jobEnded refuses a job id with an unknown kind", async () => {
  await start();
  await assert.rejects(
    engine.jobEnded({
      id: "w1/a/boss",
    }),
    code("invalid"),
  );
});

test("reconcile ends the killed jobs it waits for, and publishes job:run again for the others", async () => {
  // w1: a started worker (killed) and a task that is not started.
  await inWorktree(work("w1"), [
    task("w1", "a"),
    task("w1", "b", {
      dependOn: ["a"],
    }),
  ]);
  await taskFolder("w1", "a");
  // w2: a task merger and a worker whose merge is done (not killed).
  const doneTask = {
    completed: true,
  };
  await inWorktree(work("w2"), [
    task("w2", "x", doneTask),
    task("w2", "y", doneTask),
    task("w2", "z", {
      dependOn: ["x", "y"],
    }),
    task("w2", "t", {
      dependOn: ["x", "y"],
      summary: "merged",
    }),
  ]);
  await taskFolder("w2", "z");
  await taskFolder("w2", "t");
  // w3: a work merger (killed). w4: already proposed. w5: failed.
  await inWorktree(work("w3"), [task("w3", "a", doneTask)]);
  await inWorktree(work("w4"), [task("w4", "a", doneTask)]);
  pullRequest("w4", "open");
  await inWorktree(
    work("w5", {
      error: "boom",
    }),
    [task("w5", "a")],
  );
  await taskFolder("w5", "a");

  await start();
  await engine.reconcile([
    {
      id: "w1/a/worker",
    },
    {
      id: "w3/work-merger",
    },
    {
      id: "zz/q/worker",
    },
  ]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );

  const runs = notes
    .filter(([topic]) => topic === "job:run")
    .map(([, job]) => [job.id, job.role, job.workdir]);
  assert.deepEqual(runs, [
    [
      "w2/t/worker",
      "developer",
      worktreeDir(h.baseDir, {
        workId: "w2",
        taskId: "t",
      }),
    ],
    [
      "w2/z/task-merger",
      "task-merger",
      worktreeDir(h.baseDir, {
        workId: "w2",
        taskId: "z",
      }),
    ],
  ]);
  await waitFor(
    () =>
      done("worker:ended").length === 1 &&
      done("work-merger:ended").length === 1,
    "the ended events of the killed jobs",
  );
  assert.deepEqual(done("worker:ended")[0].data, {
    jobId: "w1/a/worker",
    error: KILLED,
  });
  assert.deepEqual(done("work-merger:ended")[0].data, {
    jobId: "w3/work-merger",
    error: KILLED,
  });
});

test("reconcile finishes the failure of a failed work whose worktree is left", async () => {
  await inWorktree(
    work("w1", {
      error: "boom",
    }),
    [
      task("w1", "a", {
        completed: true,
        error: "boom",
      }),
    ],
  );
  await taskFolder("w1", "a");
  await start();
  await engine.reconcile([]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
  for (const folder of [
    worktreeDir(h.baseDir, {
      workId: "w1",
    }),
    worktreeDir(h.baseDir, {
      workId: "w1",
      taskId: "a",
    }),
  ]) {
    assert.equal(existsSync(folder), false);
  }
  assert.ok(
    notes.some(([topic, data]) => topic === "job:stop" && data.workId === "w1"),
  );
});

test("reconcile starts a ready task whose worktree was never created", async () => {
  await inWorktree(work("w1"), [
    task("w1", "a", {
      completed: true,
      summary: "s",
    }),
    task("w1", "b", {
      dependOn: ["a"],
    }),
  ]);
  await start();
  await engine.reconcile([]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );
  assert.deepEqual(
    notes.filter(([topic]) => topic === "job:run").map(([, job]) => job.id),
    ["w1/b/worker"],
  );
  assert.equal(
    existsSync(
      worktreeDir(h.baseDir, {
        workId: "w1",
        taskId: "b",
      }),
    ),
    true,
  );
});

test("engine:ready is published once the loop is ready", async () => {
  assert.equal(notes.length, 0);
  await start();
  assert.deepEqual(
    notes.filter(([topic]) => topic === "engine:ready").length,
    1,
  );
});

test("the retry and the error of an event are relayed", async () => {
  await start();
  onBranch(work("w1"));
  pullRequest("w1", "open");
  h.git.pullRoot = async () => {
    throw new Error("boom");
  };
  await engine.decide("w1", "approve");
  await waitFor(
    () => notes.some(([topic]) => topic === "event:error"),
    "event:error",
  );
  const relayed = notes
    .filter(([topic]) => topic === "event:retry" || topic === "event:error")
    .map(([topic, data]) => [topic, data.event.payload.type, data.error]);
  assert.deepEqual(relayed, [
    ["event:retry", "work:decide", "boom"],
    ["event:error", "work:decide", "boom"],
  ]);
});

test("reconcile runs after the events left in the queue, so an ended job is not published again", async () => {
  await inWorktree(work("w1"), [task("w1", "a")]);
  await taskFolder("w1", "a");
  // A worker:ended left in the queue by the last run, not processed yet.
  await writeJson(
    path.join(
      h.baseDir,
      ".superteam",
      ".r",
      "engineloop",
      "queue",
      "000001.json",
    ),
    {
      order: 1,
      id: "left-in-the-queue",
      payload: {
        type: "worker:ended",
        data: {
          jobId: "w1/a/worker",
          summary: "did it",
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      attempts: 0,
      errors: [],
    },
  );
  await start();
  await engine.reconcile([]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );
  const types = notes
    .filter(([topic]) => topic === "event:done")
    .map(([, data]) => data.event.payload.type);
  assert.deepEqual(types, ["worker:ended", "engine:reconcile"]);
  const runs = notes
    .filter(([topic]) => topic === "job:run")
    .map(([, job]) => job.id);
  assert.ok(!runs.includes("w1/a/worker"));
});

test("reconcile skips a work whose files cannot be read, and does the others once", async () => {
  await inWorktree(work("w1"), [task("w1", "a")]);
  await taskFolder("w1", "a");
  await inWorktree(work("w2"), [task("w2", "a")]);
  await taskFolder("w2", "a");
  await writeFile(
    path.join(
      worktreeDir(h.baseDir, {
        workId: "w1",
      }),
      ".superteam",
      ".r",
      "tasks",
      "b.json",
    ),
    "{ not json",
  );
  await start();
  await engine.reconcile([]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );
  assert.deepEqual(
    notes.filter(([topic]) => topic === "job:run").map(([, job]) => job.id),
    ["w2/a/worker"],
  );
  assert.ok(
    !notes.some(
      ([topic]) => topic === "event:retry" || topic === "event:error",
    ),
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^reconcile skips the work w1: .*JSON/);
});

test("reconcile logs a work folder that has no work file", async () => {
  await mkdir(
    worktreeDir(h.baseDir, {
      workId: "w1",
    }),
    {
      recursive: true,
    },
  );
  await start();
  await engine.reconcile([]);
  await waitFor(
    () => done("engine:reconcile").length === 1,
    "engine:reconcile",
  );
  assert.deepEqual(logs, ["reconcile skips the work w1: it has no work file"]);
});
