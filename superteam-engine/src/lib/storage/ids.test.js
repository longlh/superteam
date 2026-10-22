import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { artifactId, isSlug, jobId, newWorkId, parseJobId } from "./ids.js";

describe("isSlug", () => {
  test("accepts slugs", () => {
    assert.equal(isSlug("add-login-page"), true);
    assert.equal(isSlug("a"), true);
    assert.equal(isSlug("a".repeat(63)), true);
  });

  test("refuses everything else", () => {
    for (const value of [
      "Add",
      "a b",
      "a/b",
      "..",
      "",
      "-a",
      "a-",
      "a--b",
      "a".repeat(64),
      null,
      42,
    ]) {
      assert.equal(isSlug(value), false, String(value));
    }
  });
});

test("newWorkId is 8 lowercase letters and digits", () => {
  assert.match(newWorkId(), /^[a-z0-9]{8}$/);
});

describe("jobId and parseJobId", () => {
  test("round-trip a worker and a task merger", () => {
    for (const kind of ["worker", "task-merger"]) {
      const job = {
        workId: "w",
        taskId: "t",
        kind,
      };
      assert.equal(jobId(job), `w/t/${kind}`);
      assert.deepEqual(parseJobId(jobId(job)), job);
    }
  });

  test("round-trip a work merger", () => {
    const job = {
      workId: "w",
      kind: "work-merger",
    };
    assert.equal(jobId(job), "w/work-merger");
    assert.deepEqual(parseJobId(jobId(job)), job);
  });
});

describe("artifactId", () => {
  const base = {
    workId: "w",
    taskId: "t",
    createdAt: "2026-01-01T00:00:00.000Z",
    index: 0,
  };

  test("is 64 hex characters", () => {
    assert.match(artifactId(base), /^[0-9a-f]{64}$/);
  });

  test("changes when any input changes", () => {
    const id = artifactId(base);
    assert.notEqual(
      artifactId({
        ...base,
        workId: "x",
      }),
      id,
    );
    assert.notEqual(
      artifactId({
        ...base,
        taskId: "x",
      }),
      id,
    );
    assert.notEqual(
      artifactId({
        ...base,
        createdAt: "x",
      }),
      id,
    );
    assert.notEqual(
      artifactId({
        ...base,
        index: 1,
      }),
      id,
    );
    assert.equal(
      artifactId({
        ...base,
      }),
      id,
    );
  });
});
