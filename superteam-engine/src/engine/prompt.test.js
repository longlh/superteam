import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt } from "./prompt.js";

const work = {
  id: "w",
  title: "My work",
  description: "About it",
  dod: ["ship", "test"],
};
const tasks = [
  {
    id: "b",
  },
  {
    id: "a",
  },
  {
    id: "c",
  },
  {
    id: "d",
    dependOn: ["b", "a", "c"],
    instruction: "build d",
    dod: ["first item", "second"],
    summary: "merged a and c",
  },
];

test("a worker prompt", () => {
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task: tasks[3],
    tasks,
    artifacts: [
      {
        id: "1",
        task: "a",
        work: "w",
        createdAt: "x",
        content: "found X",
      },
    ],
  });
  assert.match(prompt, /build d/);
  assert.match(prompt, /My work/);
  assert.match(prompt, /About it/);
  assert.match(prompt, /1\. first item/);
  assert.match(prompt, /2\. second/);
  assert.match(prompt, /1\. ship/);
  assert.match(prompt, /merged a and c/);
  assert.match(prompt, /- from a: found X/);
  assert.match(
    prompt,
    /To create an artifact, run: node "\/[^"]*artifact\.js" w d "<content>"\n/,
  );
  assert.match(
    prompt,
    /\nReturn data\.dodChecklist with exactly one boolean for each item of the DOD of the task, in order\.\n/,
  );
  assert.match(
    prompt,
    /\nCommit all your changes and artifacts on the current branch before you return\.$/,
  );
});

test("a task merger prompt", () => {
  const prompt = buildPrompt({
    kind: "task-merger",
    work,
    task: tasks[3],
    tasks,
    artifacts: [],
  });
  assert.match(
    prompt,
    /Branches to merge: superteam-task\/w\/a, superteam-task\/w\/c/,
  );
  assert.match(prompt, /My work/);
  assert.doesNotMatch(prompt, /To create an artifact/);
});

test("the work merger prompt", () => {
  const prompt = buildPrompt({
    kind: "work-merger",
    work,
    tasks,
    artifacts: [],
  });
  assert.match(prompt, /Branches to merge: superteam-task\/w\/d\n/);
  assert.match(prompt, /1\. ship/);
  assert.match(prompt, /2\. test/);
});

// The group build ran build-test-1, which passed, so its next tasks were
// skipped.
const looped = [
  {
    id: "docs",
    completed: true,
  },
  {
    id: "build-test-1",
    completed: true,
    gate: true,
    group: "build",
    round: 1,
    dodChecklist: [true],
  },
  {
    id: "build-fixbug-1",
    dependOn: ["build-test-1"],
    completed: true,
    skipped: true,
    group: "build",
    round: 1,
  },
  {
    id: "build-verify-1",
    dependOn: ["build-fixbug-1"],
    completed: true,
    skipped: true,
    group: "build",
    round: 1,
  },
];

test("a task merger prompt names the task that ran for a skipped one", () => {
  const task = {
    id: "release-note",
    dependOn: ["docs", "build-verify-1"],
  };
  const prompt = buildPrompt({
    kind: "task-merger",
    work,
    task,
    tasks: [...looped, task],
  });
  assert.match(prompt, /Branches to merge: superteam-task\/w\/build-test-1$/m);
});

test("the work merger prompt names the task that ran for a skipped final task", () => {
  const prompt = buildPrompt({
    kind: "work-merger",
    work,
    tasks: looped.filter((t) => t.id !== "docs"),
  });
  assert.match(prompt, /Branches to merge: superteam-task\/w\/build-test-1\n/);
});

test("a worker prompt has the artifacts of the task that ran for a skipped one", () => {
  const task = {
    id: "release-note",
    dependOn: ["build-verify-1"],
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [...looped, task],
    artifacts: [
      {
        id: "1",
        task: "build-test-1",
        work: "w",
        createdAt: "x",
        content: "all tests pass",
      },
    ],
  });
  assert.match(prompt, /- from build-test-1: all tests pass/);
});

// The group build had one round with no gate passed, and release-note
// depends on it.
const gate = (id, round, extra = {}) => ({
  id,
  completed: true,
  gate: true,
  group: "build",
  round,
  dod: ["it builds", "no test fails"],
  dodChecklist: [true, false],
  summary: `2 tests fail in ${id}`,
  ...extra,
});
const oneRound = [
  gate("build-test-1", 1),
  {
    id: "build-fixbug-1",
    dependOn: ["build-test-1"],
    completed: true,
    gate: false,
    group: "build",
    round: 1,
  },
  gate("build-verify-1", 1, {
    dependOn: ["build-fixbug-1"],
  }),
];
const releaseNote = {
  id: "release-note",
  dependOn: ["build-verify-1"],
};

test("the first task of a group has no issues", () => {
  const task = {
    id: "build-test-1",
    dependOn: ["spec"],
    gate: true,
    group: "build",
    round: 1,
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [task],
  });
  assert.doesNotMatch(prompt, /Issues of the gates/);
});

test("a task after a gate of its round has the issues of that gate", () => {
  const task = {
    id: "build-fixbug-1",
    dependOn: ["build-test-1"],
    group: "build",
    round: 1,
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [oneRound[0], task],
  });
  assert.match(
    prompt,
    /\nIssues of the gates before:\n- build-test-1: not met: no test fails\n {2}Summary: 2 tests fail in build-test-1\n/,
  );
});

test("the first task of a round has the issues of the gates of the round before", () => {
  const task = {
    id: "build-test-2",
    dependOn: ["build-verify-1"],
    gate: true,
    group: "build",
    round: 2,
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [...oneRound, task],
  });
  assert.match(
    prompt,
    /\nIssues of the gates before:\n- build-test-1: not met: no test fails\n {2}Summary: 2 tests fail in build-test-1\n- build-verify-1: not met: no test fails\n {2}Summary: 2 tests fail in build-verify-1\n/,
  );
});

test("a task has the issues of the last task of each gate before it", () => {
  const first = gate("build-test-2", 2, {
    dependOn: ["build-verify-1"],
  });
  const task = {
    id: "build-fixbug-2",
    dependOn: ["build-test-2"],
    group: "build",
    round: 2,
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [...oneRound, first, task],
  });
  assert.match(
    prompt,
    /\nIssues of the gates before:\n- build-verify-1: not met: no test fails\n {2}Summary: 2 tests fail in build-verify-1\n- build-test-2: not met: no test fails\n {2}Summary: 2 tests fail in build-test-2\n/,
  );
  assert.doesNotMatch(prompt, /- build-test-1: not met/);
});

test("a task that depends on a group has its limitations", () => {
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task: releaseNote,
    tasks: [...oneRound, releaseNote],
  });
  assert.match(
    prompt,
    /\nLimitations:\n- build stopped after 1 round; the gate build-test-1 did not pass: no test fails\n {2}Summary: 2 tests fail in build-test-1\n- build stopped after 1 round; the gate build-verify-1 did not pass: no test fails\n {2}Summary: 2 tests fail in build-verify-1\n/,
  );
});

test("a task that depends on a group through another task has its limitations", () => {
  const deploy = {
    id: "deploy",
    dependOn: ["release-note"],
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task: deploy,
    tasks: [...oneRound, releaseNote, deploy],
  });
  assert.match(
    prompt,
    /\nLimitations:\n- build stopped after 1 round; the gate build-test-1 did not pass/,
  );
});

test("a task of a group after another group has the limitations of the other group only", () => {
  const lint = gate("check-lint-1", 1, {
    dependOn: ["build-verify-1"],
    group: "check",
  });
  const task = {
    id: "check-fix-1",
    dependOn: ["check-lint-1"],
    completed: true,
    group: "check",
    round: 1,
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task,
    tasks: [...oneRound, lint, task],
  });
  assert.match(prompt, /\n- build stopped after 1 round/);
  assert.doesNotMatch(prompt, /check stopped/);
});

test("a task that depends on a group through two paths has its limitations once", () => {
  const docs = {
    id: "docs",
    dependOn: ["build-verify-1"],
  };
  const deploy = {
    id: "deploy",
    dependOn: ["release-note", "docs"],
  };
  const prompt = buildPrompt({
    kind: "worker",
    work,
    task: deploy,
    tasks: [...oneRound, releaseNote, docs, deploy],
  });
  assert.equal(prompt.match(/the gate build-test-1 did not pass/g)?.length, 1);
});

test("the work merger prompt has the limitations", () => {
  const prompt = buildPrompt({
    kind: "work-merger",
    work,
    tasks: [...oneRound, releaseNote],
  });
  assert.match(
    prompt,
    /\nLimitations:\n- build stopped after 1 round; the gate build-test-1 did not pass: no test fails\n/,
  );
});

test("no limitations when a gate of the group passed", () => {
  const passed = oneRound.map((t) =>
    t.id === "build-verify-1"
      ? {
          ...t,
          dodChecklist: [true, true],
        }
      : t,
  );
  for (const [kind, task] of [
    ["worker", releaseNote],
    ["work-merger", undefined],
  ]) {
    const prompt = buildPrompt({
      kind,
      work,
      task,
      tasks: [...passed, releaseNote],
    });
    assert.doesNotMatch(prompt, /Limitations:/);
  }
});
