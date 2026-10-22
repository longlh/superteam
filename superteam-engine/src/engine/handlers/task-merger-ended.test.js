import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { artifactsDir, worktreeDir } from "../../lib/storage/paths.js";
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

test("the same event twice changes no state the second time", async () => {
  const event = ended({
    summary: "m",
  });
  await h.handlers["task-merger:ended"](event);
  const task = await store.get("c");
  await h.handlers["task-merger:ended"](event);
  assert.deepEqual(await store.get("c"), task);
  assert.deepEqual(h.calls, []);
  // The worker job is published again: the Agents dedupe it by its id.
  assert.deepEqual(
    h.published.map(([topic, job]) => [topic, job.id]),
    [
      ["job:run", "w1/c/worker"],
      ["job:run", "w1/c/worker"],
    ],
  );
});

test("a throw after the summary is written is retried: the retry publishes the worker job", async () => {
  const bad = path.join(
    artifactsDir(
      worktreeDir(h.baseDir, {
        workId: "w1",
        taskId: "c",
      }),
      "w1",
    ),
    "bad.json",
  );
  await mkdir(path.dirname(bad), {
    recursive: true,
  });
  await writeFile(bad, "{ not json");
  const event = ended({
    summary: "merged",
  });
  await assert.rejects(h.handlers["task-merger:ended"](event));
  assert.equal((await store.get("c")).summary, "merged");
  assert.equal(h.published.length, 0);
  await rm(bad);
  await h.handlers["task-merger:ended"](event);
  assert.equal(h.published.length, 1);
  const [topic, job] = h.published[0];
  assert.equal(topic, "job:run");
  assert.equal(job.id, "w1/c/worker");
  assert.match(job.instruction.prompt, /merged/);
});

test("a throw while the work fails is retried: the retry cleans up", async () => {
  const event = ended({
    error: "conflict",
  });
  h.failOnce("push");
  await assert.rejects(h.handlers["task-merger:ended"](event), /offline/);
  assert.equal(existsSync(workTree), true);
  await h.handlers["task-merger:ended"](event);
  assert.equal(existsSync(workTree), false);
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
});

test("an event for a task that is already done is ignored", async () => {
  await h.handlers["task-merger:ended"](
    ended({
      summary: "m",
    }),
  );
  await h.handlers["worker:ended"](
    endedEvent("worker:ended", {
      jobId: "w1/c/worker",
      summary: "s",
    }),
  );
  h.published.length = 0;
  h.calls.length = 0;
  await h.handlers["task-merger:ended"](
    ended({
      summary: "m",
    }),
  );
  assert.deepEqual(h.published, []);
  assert.deepEqual(h.calls, []);
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

test("a result without summary delivered twice keeps the empty summary", async () => {
  const event = ended({});
  await h.handlers["task-merger:ended"](event);
  await h.handlers["task-merger:ended"](event);
  assert.equal((await store.get("c")).summary, "");
  assert.deepEqual(
    h.published.map(([, job]) => job.id),
    ["w1/c/worker", "w1/c/worker"],
  );
});
