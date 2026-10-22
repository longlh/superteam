import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { assignEvent, createHarness, endedEvent, now } from "./harness.js";

const linear = {
  name: "linear",
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

let h;
let workTree;
let store;

beforeEach(async () => {
  h = await createHarness({
    linear,
  });
  await h.handlers["work:assign"](
    assignEvent({
      id: "w1",
      workflow: "linear",
      title: "T",
    }),
  );
  h.published.length = 0;
  h.calls.length = 0;
  workTree = worktreeDir(h.baseDir, {
    workId: "w1",
  });
  store = createTaskStore(workTree);
});

afterEach(() => h.cleanup());

const taskTree = (taskId) =>
  worktreeDir(h.baseDir, {
    workId: "w1",
    taskId,
  });
const ended = (taskId, data) =>
  endedEvent("worker:ended", {
    jobId: `w1/${taskId}/worker`,
    ...data,
  });

test("a result completes the task, pushes its branch and removes its worktree", async () => {
  await h.handlers["worker:ended"](
    ended("a", {
      summary: "done a",
      data: {
        dodChecklist: [
          {
            item: "x",
            done: true,
          },
        ],
        other: "ignored",
      },
    }),
  );
  const task = await store.get("a");
  assert.equal(task.completed, true);
  assert.equal(task.summary, "done a");
  assert.deepEqual(task.dodChecklist, [
    {
      item: "x",
      done: true,
    },
  ]);
  assert.equal(task.completedAt, now.toISOString());
  assert.equal(task.updatedAt, now.toISOString());
  assert.equal("other" in task, false);
  assert.deepEqual(h.named("push"), [["push", "tasks/w1/a"]]);
  assert.equal(existsSync(taskTree("a")), false);
});

test("the next ready task prompt holds the artifact the ended task committed", async () => {
  h.commitArtifact("tasks/w1/a", {
    id: "art1",
    task: "a",
    work: "w1",
    createdAt: now.toISOString(),
    content: "the-artifact-content",
  });
  await h.handlers["worker:ended"](
    ended("a", {
      summary: "s",
    }),
  );
  assert.equal(h.published.length, 1);
  const [topic, job] = h.published[0];
  assert.equal(topic, "job:run");
  assert.equal(job.role, "qa");
  assert.equal(job.workdir, taskTree("b"));
  assert.match(job.instruction.prompt, /the-artifact-content/);
});

test("the last task done publishes the work merger in the work worktree", async () => {
  for (const id of ["a", "b"]) {
    await h.handlers["worker:ended"](
      ended(id, {
        summary: "s",
      }),
    );
  }
  const [topic, job] = h.published.at(-1);
  assert.equal(topic, "job:run");
  assert.equal(job.role, "work-merger");
  assert.equal(job.workdir, workTree);
  assert.equal(h.published.length, 2);
});

test("an error fails the task and the work", async () => {
  await h.handlers["worker:ended"](
    ended("a", {
      error: "boom",
    }),
  );
  const [stop] = h.published;
  assert.deepEqual(stop, [
    "job:stop",
    {
      workId: "w1",
    },
  ]);
  assert.equal(h.published.length, 1);
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
  assert.deepEqual(h.named("deleteBranch"), [["deleteBranch", "tasks/w1/a"]]);
  assert.equal(existsSync(workTree), false);
});

test("the failed task and the error of the work are written before the commit", async () => {
  await h.handlers["worker:ended"](
    ended("a", {
      error: "boom",
    }),
  );
  const [commit] = h.named("commitAll");
  assert.equal(commit[2], "Fail the work w1");
  const [work] = commit[3].works;
  assert.equal(work.error, "boom");
  assert.equal(work.updatedAt, now.toISOString());
  const task = commit[3].tasks.find((t) => t.id === "a");
  assert.equal(task.completed, true);
  assert.equal(task.error, "boom");
  assert.equal(task.completedAt, now.toISOString());
});

test("the same worker:ended twice does nothing the second time", async () => {
  const event = ended("a", {
    summary: "s",
  });
  await h.handlers["worker:ended"](event);
  const published = h.published.length;
  const calls = h.calls.length;
  await h.handlers["worker:ended"](event);
  assert.equal(h.published.length, published);
  assert.equal(h.calls.length, calls);
});

test("a worker:ended for a work whose worktree is gone is ignored", async () => {
  await h.handlers["worker:ended"](
    ended("a", {
      error: "boom",
    }),
  );
  h.published.length = 0;
  h.calls.length = 0;
  await h.handlers["worker:ended"](
    ended("b", {
      summary: "s",
    }),
  );
  assert.equal(h.published.length, 0);
  assert.equal(h.calls.length, 0);
});

test("an unknown task is ignored", async () => {
  await h.handlers["worker:ended"](
    ended("zzz", {
      summary: "s",
    }),
  );
  assert.equal(h.published.length, 0);
  assert.equal(h.calls.length, 0);
});

test("an ended job with an invalid id is ignored", async () => {
  for (const jobId of [
    "../x/worker",
    "w1/../worker",
    "w1/a/task-merger",
    "w1/a/work-merger",
    "w1",
    "",
  ]) {
    await h.handlers["worker:ended"](
      endedEvent("worker:ended", {
        jobId,
        error: "boom",
      }),
    );
  }
  await h.handlers["task-merger:ended"](
    endedEvent("task-merger:ended", {
      jobId: "w1/a/worker",
      error: "boom",
    }),
  );
  assert.equal(h.published.length, 0);
  assert.equal(h.calls.length, 0);
});
