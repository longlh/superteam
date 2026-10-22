import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { assignEvent, createHarness, endedEvent, now } from "./harness.js";

const fan = {
  name: "fan",
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
      role: "qa",
      dependOn: ["a", "b"],
    },
  ],
};

let h;
let workTree;
let store;

beforeEach(async () => {
  h = await createHarness({
    fan,
  });
  await h.handlers["work:assign"](
    assignEvent({
      id: "w1",
      workflow: "fan",
      title: "T",
    }),
  );
  for (const id of ["a", "b"]) {
    await h.handlers["worker:ended"](
      endedEvent("worker:ended", {
        jobId: `w1/${id}/worker`,
        summary: "s",
      }),
    );
  }
  h.published.length = 0;
  h.calls.length = 0;
  workTree = worktreeDir(h.baseDir, {
    workId: "w1",
  });
  store = createTaskStore(workTree);
});

afterEach(() => h.cleanup());

const ended = (data) =>
  endedEvent("task-merger:ended", {
    jobId: "w1/c/task-merger",
    ...data,
  });

test("a result writes the summary and publishes the worker job", async () => {
  await h.handlers["task-merger:ended"](
    ended({
      summary: "merged a and b",
    }),
  );
  const task = await store.get("c");
  assert.equal(task.summary, "merged a and b");
  assert.equal(task.updatedAt, now.toISOString());
  assert.equal(task.completed, undefined);
  assert.equal(h.published.length, 1);
  const [topic, job] = h.published[0];
  assert.equal(topic, "job:run");
  assert.equal(job.role, "qa");
  assert.equal(job.instruction.target, "task");
  assert.match(job.instruction.prompt, /merged a and b/);
});

test("an error fails the work", async () => {
  await h.handlers["task-merger:ended"](
    ended({
      error: "conflict",
    }),
  );
  assert.deepEqual(h.published, [
    [
      "job:stop",
      {
        workId: "w1",
      },
    ],
  ]);
  assert.equal(existsSync(workTree), false);
  const [commit] = h.named("commitAll");
  assert.equal(commit[3].works[0].error, "conflict");
  assert.equal(commit[3].tasks.find((t) => t.id === "c").error, "conflict");
});

test("the same event twice does nothing the second time", async () => {
  const event = ended({
    summary: "m",
  });
  await h.handlers["task-merger:ended"](event);
  await h.handlers["task-merger:ended"](event);
  assert.equal(h.published.length, 1);
});

test("an event for a work whose worktree is gone is ignored", async () => {
  await h.handlers["task-merger:ended"](
    ended({
      error: "x",
    }),
  );
  h.published.length = 0;
  h.calls.length = 0;
  await h.handlers["task-merger:ended"](
    ended({
      summary: "m",
    }),
  );
  assert.equal(h.published.length, 0);
  assert.equal(h.calls.length, 0);
});

test("a result without summary delivered twice publishes once", async () => {
  const event = ended({});
  await h.handlers["task-merger:ended"](event);
  await h.handlers["task-merger:ended"](event);
  assert.equal((await store.get("c")).summary, "");
  assert.equal(h.published.length, 1);
});
