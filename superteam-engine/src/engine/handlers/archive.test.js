import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { writeJson } from "../../lib/storage/files.js";
import { errorFile } from "../../lib/storage/paths.js";
import { createHarness } from "./harness.js";

let h;

beforeEach(async () => {
  h = await createHarness({});
  await h.git.createWorktree({
    branch: "superteam-work/w1",
    folder: `${h.baseDir}/works/w1`,
  });
  h.calls.length = 0;
});

afterEach(() => h.cleanup());

const archive = (id) =>
  h.handlers["work:archive"]({
    type: "work:archive",
    payload: {
      data: {
        id,
      },
    },
  });
const workJson = (work) =>
  h.branchFiles.set(
    "superteam-work/w1:.superteam/.p/works/w1.json",
    JSON.stringify(work),
  );

test("deletes the branch of a failed work", async () => {
  workJson({
    id: "w1",
    error: "boom",
  });
  await archive("w1");
  assert.deepEqual(h.named("deleteBranch"), [
    ["deleteBranch", "superteam-work/w1"],
  ]);
});

test("deletes the branch of a rejected work", async () => {
  h.pullRequests.set("superteam-work/w1", {
    url: "u",
    state: "closed",
  });
  await archive("w1");
  assert.deepEqual(h.named("deleteBranch"), [
    ["deleteBranch", "superteam-work/w1"],
  ]);
});

test("does nothing when the work is already archived", async () => {
  workJson({
    id: "w1",
    error: "boom",
  });
  await archive("w1");
  h.calls.length = 0;
  await archive("w1");
  assert.deepEqual(h.calls, []);
});

test("throws, not retryable, for any other state", async () => {
  workJson({
    id: "w1",
  });
  await assert.rejects(archive("w1"), {
    retryable: false,
  });
  h.pullRequests.set("superteam-work/w1", {
    url: "u",
    state: "open",
  });
  await assert.rejects(archive("w1"), {
    retryable: false,
  });
  h.pullRequests.set("superteam-work/w1", {
    url: "u",
    state: "merged",
  });
  await assert.rejects(archive("w1"), {
    retryable: false,
  });
  await assert.rejects(archive("W1"), {
    retryable: false,
  });
  assert.deepEqual(h.calls, []);
});

test("an archive removes the error of the engine of the work", async () => {
  await writeJson(errorFile(h.baseDir, "w1"), {
    error: "offline",
    retryable: true,
  });
  workJson({
    id: "w1",
    error: "boom",
  });
  await archive("w1");
  assert.equal(existsSync(errorFile(h.baseDir, "w1")), false);
});
