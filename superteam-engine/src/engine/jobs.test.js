import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJob } from "./jobs.js";

const work = {
  id: "w",
  title: "Work",
  dod: ["ship"],
};
const tasks = [
  {
    id: "a",
    assignee: "dev",
    timeout: 30,
    instruction: "do a",
  },
  {
    id: "c",
    assignee: "dev",
    timeout: 30,
  },
  {
    id: "d",
    assignee: "dev",
    timeout: 45,
    dependOn: ["a", "c"],
  },
];

test("a worker job", () => {
  const job = buildJob({
    kind: "worker",
    work,
    task: tasks[0],
    tasks,
    workdir: "/wt",
  });
  assert.equal(job.id, "w/a/worker");
  assert.equal(job.role, "dev");
  assert.equal(job.timeout, 30);
  assert.equal(job.workdir, "/wt");
  assert.equal(job.instruction.target, "task");
  assert.deepEqual(job.instruction.targetIds, ["a"]);
  assert.match(job.instruction.prompt, /do a/);
  assert.deepEqual(job.schema.required, ["summary", "data"]);
});

test("a task merger job", () => {
  const job = buildJob({
    kind: "task-merger",
    work,
    task: tasks[2],
    tasks,
    workdir: "/wt",
  });
  assert.equal(job.id, "w/d/task-merger");
  assert.equal(job.role, "task-merger");
  assert.equal(job.timeout, 720);
  assert.equal(job.instruction.target, "merge");
  assert.deepEqual(job.instruction.targetIds, ["c"]);
});

test("the work merger job", () => {
  const job = buildJob({
    kind: "work-merger",
    work,
    tasks,
    workdir: "/wt",
  });
  assert.equal(job.id, "w/work-merger");
  assert.equal(job.role, "work-merger");
  assert.equal(job.timeout, 720);
  assert.equal(job.instruction.target, "work");
  assert.deepEqual(job.instruction.targetIds, ["w"]);
});

test("the artifacts reach the prompt of a worker", () => {
  const job = buildJob({
    kind: "worker",
    work,
    task: tasks[2],
    tasks,
    workdir: "/wt",
    artifacts: [
      {
        id: "1",
        task: "a",
        work: "w",
        createdAt: "x",
        content: "hello",
      },
    ],
  });
  assert.match(job.instruction.prompt, /from a: hello/);
});

test("an unknown kind is refused", () => {
  assert.throws(() =>
    buildJob({
      kind: "x",
      work,
      tasks,
      workdir: "/wt",
    }),
  );
});

test("a task merger job targets the task that ran for a skipped one", () => {
  const group = [
    {
      id: "build-test-1",
      completed: true,
      group: "build",
    },
    {
      id: "build-verify-1",
      dependOn: ["build-test-1"],
      completed: true,
      skipped: true,
      group: "build",
    },
    {
      id: "e",
      assignee: "dev",
      timeout: 30,
      dependOn: ["a", "build-verify-1"],
    },
  ];
  const job = buildJob({
    kind: "task-merger",
    work,
    task: group[2],
    tasks: [...tasks, ...group],
    workdir: "/wt",
  });
  assert.deepEqual(job.instruction.targetIds, ["build-test-1"]);
});
