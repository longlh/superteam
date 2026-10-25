# Small loop fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Close four small gaps that the review of the workflow loops (ADR 19)
found: a group name that takes the id of a task, a `gate` that is not a boolean,
a group `description` that is not a string, and limitations that do not reach
the steps after a group that depend on it through other steps.

**Architecture:** Three checks are added to `validateWorkflow`, and the prompt
of a worker gets the limitations of every group that it comes after, directly or
through other tasks.

**Tech Stack:** Node.js, `node:test`, ESLint, Prettier.

**Spec:** `docs/09_decisions/0019-workflow-loops.md`

## Global Constraints

- The limitations are "given to the steps after the group and to the work
  merger" (ADR 19).
- The names of a workflow and the ids of its tasks must not collide; the error
  is `duplicate task id {id}`.
- Run `npx prettier --write` on each file that is changed.

## Review Focus

- A task inside a group that comes after another group gets the limitations of
  that other group, and never those of its own group.
- A dependency graph with a diamond (two paths to the same task) gives each
  group once.

---

### Task 1: Three checks in validateWorkflow

**Files:**

- Modify: `superteam-engine/src/lib/storage/validate.js` (`validateStep`,
  `validateLoop`, the `ids` check in `validateWorkflow`)
- Test: `superteam-engine/src/lib/storage/validate.test.js`, in
  `describe("validateWorkflow with a loop group")`

- [ ] **Step 1: Write the failing tests**

```js
test("refuses a group named as a task of another group", () => {
  const one = (name, inner, more = {}) =>
    group(
      { name, dependOn: [] },
      {
        maxRounds: 1,
        steps: [step(inner, { gate: true, dod: ["x"] }), ...(more.steps ?? [])],
      },
    );
  refuses(
    {
      name: "feature",
      title: "Feature",
      steps: [one("x-test-1", "a"), one("x", "test")],
    },
    "duplicate task id x-test-1",
  );
});

test("refuses a gate that is not a boolean", () => {
  const [testStep, ...rest] = loopSteps();
  refuses(
    flow(group({}, { steps: [{ ...testStep, gate: "true" }, ...rest] })),
    "step test: gate must be a boolean",
  );
});

test("refuses a group description that is not a string", () => {
  refuses(
    flow(group({ description: 1 })),
    "step build: description must be a string",
  );
});
```

- [ ] **Step 2: Run them and see the three fail**

Run: `node --test superteam-engine/src/lib/storage/validate.test.js` Expected:
the 3 new tests fail on `assert.equal` (null instead of the reason).

- [ ] **Step 3: Write the code**

- `validateWorkflow`: the `ids` check also adds the name of each group.
- `validateStep`: right after the check `gate is only for a step of a loop`,
  refuse `step.gate !== undefined && typeof step.gate !== "boolean"` with
  `${at}: gate must be a boolean`.
- `validateLoop`: refuse a `description` that is defined and not a string, with
  `${at}: description must be a string`.

- [ ] **Step 4: Run the file and see all its tests pass**

Run: `node --test superteam-engine/src/lib/storage/validate.test.js` Expected: 0
fail.

### Task 2: The limitations reach every step after a group

**Files:**

- Modify: `superteam-engine/src/engine/prompt.js` (`groupsBefore`)
- Modify: `docs/05_building-blocks/agents/claude-process.md:21-22`
- Test: `superteam-engine/src/engine/prompt.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("a task that depends on a group through another task has its limitations", () => {
  const deploy = { id: "deploy", dependOn: ["release-note"] };
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test superteam-engine/src/engine/prompt.test.js` Expected: the new
test fails on `assert.match`.

- [ ] **Step 3: Write the code**

`groupsBefore(task, tasks)` walks every dependency of the task, directly or not,
each task once, and returns the set of their groups, except the group of the
task itself.

- [ ] **Step 4: Run the file and see all its tests pass**

Run: `node --test superteam-engine/src/engine/prompt.test.js` Expected: 0 fail.

- [ ] **Step 5: Update the doc**

In `docs/05_building-blocks/agents/claude-process.md`, replace:

```
- The prompt of a task that depends on a loop group, and the prompt of the work
  merger, hold the limitations of the work, when a loop group left some.
```

with:

```
- The prompt of a task that depends on a loop group, directly or through other
  tasks, and the prompt of the work merger, hold the limitations of the work,
  when a loop group left some.
```

### Task 3: Check the whole

- [ ] **Step 1:** Run `npm test` at the root. Expected: 0 fail.
- [ ] **Step 2:** Run `npx eslint .`. Expected: no error.
- [ ] **Step 3:** Run `npx prettier --check` on the changed files. Expected: all
      formatted.
- [ ] **Step 4:** Review with `superpowers:requesting-code-review`, then
      `superpowers:receiving-code-review`.
