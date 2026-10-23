import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { taskStatus } from "../lib/storage/status.js";
import { createTasks, createTaskStore, finalTasks } from "./tasks.js";

const work = {
  id: "w",
  title: "Work",
};
const workflow = {
  name: "wf",
  steps: [
    {
      name: "a",
      role: "dev",
      instruction: "do a",
      dod: ["x"],
    },
    {
      name: "b",
      role: "qa",
      dependOn: ["a"],
      timeout: 30,
      description: "desc b",
    },
  ],
};
const now = new Date("2026-01-02T03:04:05.000Z");

test("createTasks makes one task for each step", () => {
  const [a, b] = createTasks(work, workflow, now);
  assert.equal(a.id, "a");
  assert.equal(a.title, "a");
  assert.equal(a.assignee, "dev");
  assert.equal(a.timeout, 720);
  assert.equal(a.work, "w");
  assert.equal(a.instruction, "do a");
  assert.deepEqual(a.dod, ["x"]);
  assert.deepEqual(a.dependOn, []);
  assert.equal(a.createdAt, now.toISOString());
  assert.equal(a.updatedAt, now.toISOString());
  assert.equal("completed" in a, false);
  assert.deepEqual(b.dependOn, ["a"]);
  assert.equal(b.timeout, 30);
  assert.equal(b.description, "desc b");
});

test("createTasks unrolls a loop group and keeps gate, group and round", () => {
  const tasks = createTasks(
    work,
    {
      name: "wf",
      steps: [
        {
          name: "build",
          loop: {
            maxRounds: 2,
            steps: [
              {
                name: "fix",
                role: "developer",
              },
              {
                name: "test",
                role: "tester",
                dependOn: ["fix"],
                gate: true,
                dod: ["no test fails"],
              },
            ],
          },
        },
      ],
    },
    now,
  );
  const test2 = tasks.find((t) => t.id === "build-test-2");
  assert.equal(test2.gate, true);
  assert.equal(test2.group, "build");
  assert.equal(test2.round, 2);
  assert.equal(test2.assignee, "tester");
  assert.deepEqual(test2.dependOn, ["build-fix-2"]);
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["build-fix-1", "build-test-1", "build-fix-2", "build-test-2"],
  );
});

test("createTasks adds no gate, group or round to a step outside a group", () => {
  const [a] = createTasks(work, workflow, now);
  for (const field of ["gate", "group", "round"]) {
    assert.equal(field in a, false);
  }
});

test("taskStatus of b is PENDING until a is completed", () => {
  const tasks = createTasks(work, workflow, now);
  assert.equal(taskStatus(tasks[1], tasks), "PENDING");
  tasks[0].completed = true;
  assert.equal(taskStatus(tasks[1], tasks), "IN_PROGRESS");
});

test("finalTasks of a diamond is [d]", () => {
  const tasks = [
    {
      id: "a",
    },
    {
      id: "b",
      dependOn: ["a"],
    },
    {
      id: "c",
      dependOn: ["a"],
    },
    {
      id: "d",
      dependOn: ["b", "c"],
    },
  ];
  assert.deepEqual(
    finalTasks(tasks).map((t) => t.id),
    ["d"],
  );
});

test("the store round-trips a task and lists an empty worktree", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st-tasks-"));
  try {
    const store = createTaskStore(dir);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.get("a"), null);
    const [a] = createTasks(work, workflow, now);
    await store.put(a);
    assert.deepEqual(await store.get("a"), a);
    assert.deepEqual(await store.list(), [a]);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
});
