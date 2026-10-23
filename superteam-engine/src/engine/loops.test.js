import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gatePassed,
  limitationsOf,
  ranTask,
  roundIssues,
  skips,
  unrollSteps,
} from "./loops.js";

const build = {
  name: "build",
  dependOn: ["spec"],
  loop: {
    maxRounds: 3,
    steps: [
      {
        name: "test",
        role: "tester",
        gate: true,
        dod: ["no test fails"],
      },
      {
        name: "fixbug",
        role: "developer",
        dependOn: ["test"],
      },
      {
        name: "verify",
        role: "tester",
        dependOn: ["fixbug"],
        gate: true,
        dod: ["no test fails"],
      },
    ],
  },
};
const steps = [
  {
    name: "spec",
    role: "analyst",
  },
  build,
  {
    name: "release-note",
    role: "writer",
    dependOn: ["build"],
  },
];

test("unrollSteps replaces a group by its tasks, round after round", () => {
  const unrolled = unrollSteps(steps);
  assert.deepEqual(
    unrolled.map((s) => s.name),
    [
      "spec",
      "build-test-1",
      "build-fixbug-1",
      "build-verify-1",
      "build-test-2",
      "build-fixbug-2",
      "build-verify-2",
      "build-test-3",
      "build-fixbug-3",
      "build-verify-3",
      "release-note",
    ],
  );
  const byName = new Map(unrolled.map((s) => [s.name, s]));
  assert.deepEqual(byName.get("build-test-1").dependOn, ["spec"]);
  assert.deepEqual(byName.get("build-fixbug-1").dependOn, ["build-test-1"]);
  assert.deepEqual(byName.get("build-test-2").dependOn, ["build-verify-1"]);
  assert.deepEqual(byName.get("release-note").dependOn, ["build-verify-3"]);
});

test("unrollSteps gives each task of a group its step, group and round", () => {
  const verify = unrollSteps(steps).find((s) => s.name === "build-verify-2");
  assert.deepEqual(verify, {
    name: "build-verify-2",
    role: "tester",
    dependOn: ["build-fixbug-2"],
    gate: true,
    dod: ["no test fails"],
    group: "build",
    round: 2,
  });
  const fixbug = unrollSteps(steps).find((s) => s.name === "build-fixbug-1");
  assert.equal(fixbug.gate, undefined);
});

test("unrollSteps gives no dependency to the first task of a group with none", () => {
  const { dependOn, ...first } = build;
  const [task] = unrollSteps([first]);
  assert.equal(task.name, "build-test-1");
  assert.deepEqual(task.dependOn, []);
});

test("unrollSteps returns a workflow with no group as it is", () => {
  const plain = [
    {
      name: "a",
      role: "dev",
    },
    {
      name: "b",
      role: "qa",
      dependOn: ["a"],
    },
  ];
  assert.deepEqual(unrollSteps(plain), plain);
});

test("unrollSteps follows the chain, not the order the steps are written in", () => {
  const [testStep, fixbug, verify] = build.loop.steps;
  const unrolled = unrollSteps([
    {
      ...build,
      dependOn: [],
      loop: {
        maxRounds: 2,
        steps: [verify, testStep, fixbug],
      },
    },
    {
      name: "release-note",
      role: "writer",
      dependOn: ["build"],
    },
  ]);
  assert.deepEqual(
    unrolled.map((s) => s.name),
    [
      "build-test-1",
      "build-fixbug-1",
      "build-verify-1",
      "build-test-2",
      "build-fixbug-2",
      "build-verify-2",
      "release-note",
    ],
  );
  assert.deepEqual(unrolled[3].dependOn, ["build-verify-1"]);
  assert.deepEqual(unrolled[6].dependOn, ["build-verify-2"]);
});

const done = (id, extra = {}) => ({
  id,
  completed: true,
  ...extra,
});
const ran = [
  done("spec"),
  done("build-test-1", {
    dependOn: ["spec"],
    gate: true,
    group: "build",
    round: 1,
    dod: ["a", "b"],
    dodChecklist: [true, true],
  }),
  {
    id: "build-fixbug-1",
    dependOn: ["build-test-1"],
    gate: false,
    group: "build",
    round: 1,
  },
  {
    id: "build-verify-1",
    dependOn: ["build-fixbug-1"],
    gate: true,
    group: "build",
    round: 1,
  },
  {
    id: "release-note",
    dependOn: ["build-verify-1"],
  },
];

test("gatePassed is true for a done gate whose DOD is all true", () => {
  assert.equal(gatePassed(ran[1]), true);
  assert.equal(
    gatePassed({
      ...ran[1],
      dodChecklist: [true, false],
    }),
    false,
  );
  assert.equal(
    gatePassed({
      ...ran[1],
      gate: false,
    }),
    false,
  );
  assert.equal(
    gatePassed({
      ...ran[1],
      completed: false,
    }),
    false,
  );
});

test("skips is true for a task of a group after a passed gate", () => {
  assert.equal(skips(ran[2], ran), true);
  const failed = ran.map((t) =>
    t.id === "build-test-1"
      ? {
          ...t,
          dodChecklist: [true, false],
        }
      : t,
  );
  assert.equal(skips(failed[2], failed), false);
  assert.equal(skips(ran[4], ran), false);
  assert.equal(skips(ran[1], ran), false);
});

test("ranTask follows a skipped task back to the task that ran", () => {
  const skipped = ran.map((t) =>
    t.group && t.id !== "build-test-1"
      ? {
          ...t,
          completed: true,
          skipped: true,
        }
      : t,
  );
  assert.equal(ranTask("build-verify-1", skipped).id, "build-test-1");
  assert.equal(ranTask("build-fixbug-1", skipped).id, "build-test-1");
  assert.equal(ranTask("spec", skipped).id, "spec");
});

// The tasks of a group test -> fixbug -> verify run for `rounds` rounds, and
// no gate passed: each gate has two items, the second one false.
function failedRounds(rounds) {
  const tasks = [];
  let before = "spec";
  for (let round = 1; round <= rounds; round += 1) {
    for (const [step, gate] of [
      ["test", true],
      ["fixbug", false],
      ["verify", true],
    ]) {
      const id = `build-${step}-${round}`;
      tasks.push({
        id,
        dependOn: [before],
        completed: true,
        gate,
        group: "build",
        round,
        summary: `summary of ${id}`,
        ...(gate
          ? {
              dod: ["it builds", "no test fails"],
              dodChecklist: [true, false],
            }
          : {}),
      });
      before = id;
    }
  }
  return tasks;
}

test("roundIssues gives the failed items and the summary of each gate", () => {
  assert.deepEqual(roundIssues("build", 2, failedRounds(3)), [
    {
      gate: "build-test-2",
      failed: ["no test fails"],
      summary: "summary of build-test-2",
    },
    {
      gate: "build-verify-2",
      failed: ["no test fails"],
      summary: "summary of build-verify-2",
    },
  ]);
});

test("limitationsOf gives the issues of the last round when no gate passed", () => {
  const [limitation] = limitationsOf(failedRounds(3));
  assert.equal(limitation.group, "build");
  assert.equal(limitation.rounds, 3);
  assert.deepEqual(
    limitation.issues.map((i) => i.gate),
    ["build-test-3", "build-verify-3"],
  );
  assert.equal(limitationsOf(failedRounds(3)).length, 1);
});

test("limitationsOf with one round gives the issues of round 1", () => {
  assert.deepEqual(limitationsOf(failedRounds(1)), [
    {
      group: "build",
      rounds: 1,
      issues: roundIssues("build", 1, failedRounds(1)),
    },
  ]);
});

test("limitationsOf is empty when a gate passed", () => {
  const tasks = failedRounds(3);
  tasks[5].dodChecklist = [true, true];
  assert.deepEqual(limitationsOf(tasks), []);
});

test("limitationsOf is empty while the last round has not ended", () => {
  const tasks = failedRounds(3);
  delete tasks.at(-1).completed;
  assert.deepEqual(limitationsOf(tasks), []);
});
