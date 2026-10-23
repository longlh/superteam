import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createHarness } from "./harness.js";

let h;

beforeEach(async () => {
  h = await createHarness({});
  for (const branch of [
    "superteam-work/w1",
    "superteam-task/w1/a",
    "superteam-task/w1/b",
    "superteam-task/w2/a",
  ]) {
    await h.git.createWorktree({
      branch,
      folder: `${h.baseDir}/${branch}`,
    });
  }
  h.calls.length = 0;
});

afterEach(() => h.cleanup());

const decide = (data) =>
  h.handlers["work:decide"]({
    type: "work:decide",
    payload: {
      data,
    },
  });
const open = (state = "open") =>
  h.pullRequests.set("superteam-work/w1", {
    url: "u",
    state,
  });
const names = () => h.calls.map(([n, arg]) => [n, arg].filter(Boolean));

test("approve merges, deletes all the branches, then fetches", async () => {
  open();
  await decide({
    id: "w1",
    decision: "approve",
  });
  assert.deepEqual(names(), [
    ["mergePullRequest", "superteam-work/w1"],
    ["deleteBranch", "superteam-work/w1"],
    ["deleteBranch", "superteam-task/w1/a"],
    ["deleteBranch", "superteam-task/w1/b"],
    ["fetch"],
  ]);
});

test("approve of an already merged work repairs without merging", async () => {
  open("merged");
  await decide({
    id: "w1",
    decision: "approve",
  });
  assert.equal(h.named("mergePullRequest").length, 0);
  assert.equal(h.named("fetch").length, 1);
  assert.equal(h.named("deleteBranch").length, 3);
  h.calls.length = 0;
  await decide({
    id: "w1",
    decision: "approve",
  });
  assert.equal(h.named("deleteBranch").length, 0);
});

test("approve of a work that is not open throws, not retryable", async () => {
  for (const state of [undefined, "closed"]) {
    if (state) {
      open(state);
    }
    await assert.rejects(
      decide({
        id: "w1",
        decision: "approve",
      }),
      {
        retryable: false,
      },
    );
  }
  assert.deepEqual(h.calls, []);
});

test("reject closes the pull request and deletes only the task branches", async () => {
  open();
  await decide({
    id: "w1",
    decision: "reject",
  });
  assert.deepEqual(names(), [
    ["closePullRequest", "superteam-work/w1"],
    ["deleteBranch", "superteam-task/w1/a"],
    ["deleteBranch", "superteam-task/w1/b"],
  ]);
});

test("reject of an already closed work only deletes the task branches", async () => {
  open("closed");
  await decide({
    id: "w1",
    decision: "reject",
  });
  assert.equal(h.named("closePullRequest").length, 0);
  assert.equal(h.named("deleteBranch").length, 2);
});

test("reject of a work with no open or closed pull request throws", async () => {
  for (const state of [undefined, "merged"]) {
    if (state) {
      open(state);
    }
    await assert.rejects(
      decide({
        id: "w1",
        decision: "reject",
      }),
      {
        retryable: false,
      },
    );
  }
});

test("an invalid id or decision throws, not retryable", async () => {
  for (const data of [
    {
      id: "W1",
      decision: "approve",
    },
    {
      id: "../x",
      decision: "approve",
    },
    {
      id: "w1",
      decision: "maybe",
    },
  ]) {
    await assert.rejects(decide(data), {
      retryable: false,
    });
  }
  assert.deepEqual(h.calls, []);
});
