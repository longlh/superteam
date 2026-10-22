import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { approvalStatus, taskStatus, workStatus } from "./status.js";

const done = {
  id: "d",
  completed: true,
};
const failed = {
  id: "f",
  completed: true,
  error: "boom",
};
const running = {
  id: "r",
  completed: false,
};

describe("taskStatus", () => {
  test("PENDING when a dependency is not DONE", () => {
    const task = {
      id: "t",
      dependOn: ["r"],
    };
    assert.equal(taskStatus(task, [task, running]), "PENDING");
  });

  test("PENDING when a dependency failed", () => {
    const task = {
      id: "t",
      dependOn: ["f"],
    };
    assert.equal(taskStatus(task, [task, failed]), "PENDING");
  });

  test("PENDING when a dependency is missing", () => {
    const task = {
      id: "t",
      dependOn: ["nope"],
    };
    assert.equal(taskStatus(task, [task]), "PENDING");
  });

  test("IN_PROGRESS with no dependency or done ones", () => {
    const a = {
      id: "a",
    };
    const b = {
      id: "b",
      dependOn: ["d"],
    };
    assert.equal(taskStatus(a, [a]), "IN_PROGRESS");
    assert.equal(taskStatus(b, [b, done]), "IN_PROGRESS");
  });

  test("DONE and FAILED", () => {
    assert.equal(taskStatus(done, [done]), "DONE");
    assert.equal(taskStatus(failed, [failed]), "FAILED");
  });
});

describe("workStatus", () => {
  const work = {
    id: "w",
  };

  test("OPEN with no task", () => {
    assert.equal(
      workStatus({
        work,
        tasks: [],
        proposed: false,
      }),
      "OPEN",
    );
  });

  test("IN_PROGRESS while a task is not completed", () => {
    assert.equal(
      workStatus({
        work,
        tasks: [done, running],
        proposed: false,
      }),
      "IN_PROGRESS",
    );
  });

  test("DONE when all tasks are completed", () => {
    assert.equal(
      workStatus({
        work,
        tasks: [done],
        proposed: false,
      }),
      "DONE",
    );
  });

  test("DONE when proposed, with no task", () => {
    assert.equal(
      workStatus({
        work,
        tasks: [],
        proposed: true,
      }),
      "DONE",
    );
  });

  test("FAILED when the work has an error, even with tasks", () => {
    const bad = {
      id: "w",
      error: "task failed",
    };
    assert.equal(
      workStatus({
        work: bad,
        tasks: [done, running],
        proposed: false,
      }),
      "FAILED",
    );
    assert.equal(
      workStatus({
        work: bad,
        tasks: [],
        proposed: false,
      }),
      "FAILED",
    );
  });
});

test("approvalStatus", () => {
  assert.equal(approvalStatus(null), "DRAFT");
  assert.equal(
    approvalStatus({
      state: "open",
    }),
    "PROPOSED",
  );
  assert.equal(
    approvalStatus({
      state: "merged",
    }),
    "APPROVED",
  );
  assert.equal(
    approvalStatus({
      state: "closed",
    }),
    "REJECTED",
  );
});
