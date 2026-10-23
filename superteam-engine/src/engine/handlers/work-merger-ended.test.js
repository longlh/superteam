import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { readJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { assignEvent, createHarness, endedEvent, now } from "./harness.js";

const flow = {
  name: "flow",
  title: "Flow",
  steps: [
    {
      name: "a",
      role: "dev",
      dod: ["t1"],
    },
  ],
};

let h;
let workTree;

beforeEach(async () => {
  h = await createHarness({
    flow,
  });
  await h.handlers["work:assign"](
    assignEvent({
      id: "w1",
      workflow: "flow",
      title: "Title",
      dod: ["ok", "docs"],
    }),
  );
  await h.handlers["worker:ended"](
    endedEvent("worker:ended", {
      jobId: "w1/a/worker",
      summary: "s",
      data: {
        dodChecklist: [true],
      },
    }),
  );
  h.calls.length = 0;
  h.published.length = 0;
  workTree = worktreeDir(h.baseDir, {
    workId: "w1",
  });
});

afterEach(() => h.cleanup());

const ended = (data) =>
  h.handlers["work-merger:ended"](endedEvent("work-merger:ended", data));

test("commits the checklist, pushes, opens the pull request, removes the worktree", async () => {
  const dodChecklist = [true, false];
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
    data: {
      dodChecklist,
      extra: 1,
    },
  });
  const [commit] = h.named("commitAll");
  assert.equal(commit[2], "Propose the work w1");
  assert.deepEqual(commit[3].works[0].dodChecklist, dodChecklist);
  assert.equal(commit[3].works[0].extra, undefined);
  assert.equal(commit[3].works[0].updatedAt, now.toISOString());
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
  assert.deepEqual(h.named("openPullRequest"), [
    [
      "openPullRequest",
      {
        branch: "works/w1",
        base: "main",
        title: "Title",
        body: "S\n\n## Work DOD\n\n- [x] ok\n- [ ] docs\n\n## Task `a` DOD\n\n- [x] t1\n",
      },
    ],
  ]);
  assert.deepEqual(h.named("removeWorktree"), [["removeWorktree", workTree]]);
  assert.equal(existsSync(workTree), false);
});

test("a second event opens no second pull request", async () => {
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
  });
  h.calls.length = 0;
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
  });
  assert.deepEqual(h.calls, []);
});

test("with a pull request already open, only removes the worktree", async () => {
  h.pullRequests.set("works/w1", {
    url: "u",
    state: "open",
  });
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
  });
  assert.deepEqual(
    h.calls.map(([n]) => n),
    ["removeWorktree"],
  );
});

test("an error fails the work", async () => {
  await ended({
    jobId: "w1/work-merger",
    error: "boom",
  });
  assert.equal(h.named("openPullRequest").length, 0);
  assert.deepEqual(h.published[0], [
    "job:stop",
    {
      workId: "w1",
    },
  ]);
  assert.equal(h.named("commitAll")[0][2], "Fail the work w1");
  assert.equal(existsSync(workTree), false);
});

test("a throw while the work fails is retried: the retry cleans up", async () => {
  const event = {
    jobId: "w1/work-merger",
    error: "boom",
  };
  h.failOnce("push");
  await assert.rejects(ended(event), /offline/);
  assert.equal(existsSync(workTree), true);
  await ended(event);
  assert.equal(existsSync(workTree), false);
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
});

test("a throw before the pull request is open is retried: the retry opens it", async () => {
  h.failOnce("push");
  await assert.rejects(
    ended({
      jobId: "w1/work-merger",
      summary: "S",
    }),
    /offline/,
  );
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
  });
  assert.equal(h.named("openPullRequest").length, 1);
  assert.equal(existsSync(workTree), false);
});

test("is ignored for a bad id, a task id, or a gone worktree", async () => {
  for (const jobId of [
    undefined,
    "W1/work-merger",
    "w1/a/work-merger",
    "w1/worker",
    "nope/work-merger",
  ]) {
    await ended({
      jobId,
      summary: "S",
    });
  }
  assert.deepEqual(h.calls, []);
  assert.equal(
    (await readJson(workFile(workTree, "w1"))).dodChecklist,
    undefined,
  );
});

const tasksFolder = () =>
  path.dirname(
    worktreeDir(h.baseDir, {
      workId: "w1",
      taskId: "a",
    }),
  );

test("the folder of the tasks of the work is removed once the work is proposed", async () => {
  assert.equal(existsSync(tasksFolder()), true);
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
    data: {
      dodChecklist: [true, false],
    },
  });
  assert.equal(existsSync(tasksFolder()), false);
});

test("the folder of the tasks is kept while a task folder is left in it", async () => {
  await mkdir(path.join(tasksFolder(), "left"), {
    recursive: true,
  });
  await ended({
    jobId: "w1/work-merger",
    summary: "S",
    data: {
      dodChecklist: [true, false],
    },
  });
  assert.equal(existsSync(path.join(tasksFolder(), "left")), true);
});
