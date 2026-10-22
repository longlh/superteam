import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentsDir,
  artifactsDir,
  p,
  r,
  taskFile,
  workFile,
  workflowFile,
  worktreeDir,
} from "./paths.js";

test("p and r are the persistence and runtime folders", () => {
  assert.equal(p("/x"), "/x/.superteam/.p");
  assert.equal(r("/x"), "/x/.superteam/.r");
});

test("persistence paths", () => {
  assert.equal(workFile("/x", "w"), "/x/.superteam/.p/works/w.json");
  assert.equal(
    workflowFile("/x", "flow"),
    "/x/.superteam/.p/workflows/flow.json",
  );
  assert.equal(artifactsDir("/x", "w"), "/x/.superteam/.p/artifacts/w");
});

test("runtime paths", () => {
  assert.equal(taskFile("/x", "t"), "/x/.superteam/.r/tasks/t.json");
  assert.equal(agentsDir("/x"), "/x/.superteam/.r/agents");
});

test("worktreeDir of a work and of a task", () => {
  assert.equal(
    worktreeDir("/x", {
      workId: "w",
    }),
    "/x/.superteam/.r/worktrees/works/w",
  );
  assert.equal(
    worktreeDir("/x", {
      workId: "w",
      taskId: "t",
    }),
    "/x/.superteam/.r/worktrees/tasks/w/t",
  );
});
