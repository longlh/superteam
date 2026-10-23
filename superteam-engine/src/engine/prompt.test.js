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
