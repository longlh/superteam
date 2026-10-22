import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { artifactsDir, worktreeDir } from "../../lib/storage/paths.js";
import { assignEvent, createHarness, endedEvent } from "./harness.js";

const linear = {
  name: "linear",
  title: "Linear",
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
});

afterEach(() => h.cleanup());

const taskTree = (taskId) =>
  worktreeDir(h.baseDir, {
    workId: "w1",
    taskId,
  });

test("a job that cannot be built removes the new worktree, so a retry starts the task", async () => {
  // The first worktree of b holds a corrupt artifact: its job cannot be built.
  const { createWorktree } = h.git;
  let corrupt = true;
  h.git.createWorktree = async (args) => {
    await createWorktree(args);
    if (corrupt && args.folder === taskTree("b")) {
      corrupt = false;
      const folder = artifactsDir(args.folder, "w1");
      await mkdir(folder, {
        recursive: true,
      });
      await writeFile(path.join(folder, "bad.json"), "{ not json");
    }
  };
  const event = endedEvent("worker:ended", {
    jobId: "w1/a/worker",
    summary: "s",
  });
  await assert.rejects(h.handlers["worker:ended"](event));
  assert.equal(existsSync(taskTree("b")), false);
  assert.equal(h.published.length, 0);

  await h.handlers["worker:ended"](event);
  assert.equal(existsSync(taskTree("b")), true);
  assert.deepEqual(
    h.published.map(([topic, job]) => [topic, job.id]),
    [["job:run", "w1/b/worker"]],
  );
});
