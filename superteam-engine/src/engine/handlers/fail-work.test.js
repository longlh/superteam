import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { worktreeDir } from "../../lib/storage/paths.js";
import { failWork } from "./fail-work.js";
import { assignEvent, createHarness } from "./harness.js";

const linear = {
  name: "linear",
  title: "Linear",
  steps: [
    {
      name: "a",
      role: "dev",
    },
  ],
};

let h;
let deps;

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
  deps = {
    baseDir: h.baseDir,
    git: h.git,
    publish: (topic, data) => h.published.push([topic, data]),
    now: () => new Date("2026-02-02T00:00:00.000Z"),
  };
});

afterEach(() => h.cleanup());

test("failing twice commits the error once and still cleans up", async () => {
  const workTree = worktreeDir(h.baseDir, {
    workId: "w1",
  });
  // A crash after the commit, before the cleanup: the worktree is still there.
  await assert.rejects(
    failWork({
      deps: {
        ...deps,
        git: {
          ...h.git,
          push: async () => {
            throw new Error("offline");
          },
        },
      },
      workId: "w1",
      error: "first",
    }),
    /offline/,
  );
  assert.equal(existsSync(workTree), true);
  await failWork({
    deps,
    workId: "w1",
    error: "second",
  });
  assert.equal(existsSync(workTree), false);
  const commits = h.named("commitAll");
  assert.equal(commits.length, 2);
  for (const commit of commits) {
    assert.equal(commit[3].works[0].error, "first");
  }
  assert.deepEqual(h.named("deleteBranch"), [["deleteBranch", "tasks/w1/a"]]);
});

test("a throw of the commit after the error is written is retried: the retry commits it", async () => {
  h.failOnce("commitAll");
  await assert.rejects(
    failWork({
      deps,
      workId: "w1",
      error: "first",
    }),
    /offline/,
  );
  await failWork({
    deps,
    workId: "w1",
    error: "second",
  });
  const commits = h.named("commitAll");
  assert.equal(commits.length, 1);
  assert.equal(commits[0][2], "Fail the work w1");
  assert.equal(commits[0][3].works[0].error, "first");
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
});

test("a work whose worktree is gone does nothing", async () => {
  await failWork({
    deps,
    workId: "nope",
    error: "x",
  });
  assert.equal(h.published.length, 0);
  assert.equal(h.calls.length, 0);
});

test("the cause of the error is agent, unless it is given", async () => {
  await failWork({
    deps,
    workId: "w1",
    error: "boom",
  });
  const [, , , state] = h.named("commitAll").at(-1);
  assert.equal(state.works[0].error, "boom");
  assert.equal(state.works[0].errorCause, "agent");
});

test("work:fail fails the work with the cause engine", async () => {
  await h.handlers["work:fail"]({
    type: "work:fail",
    payload: {
      data: {
        id: "w1",
        error: "workflow linear: step a: role must be a slug",
      },
    },
  });
  const [, , , state] = h.named("commitAll").at(-1);
  assert.equal(
    state.works[0].error,
    "workflow linear: step a: role must be a slug",
  );
  assert.equal(state.works[0].errorCause, "engine");
  assert.deepEqual(h.named("push"), [["push", "works/w1"]]);
  assert.equal(
    existsSync(
      worktreeDir(h.baseDir, {
        workId: "w1",
      }),
    ),
    false,
  );
});
