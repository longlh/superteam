# Workflow loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workflow can repeat a group of steps, a straight chain, until a gate
in it passes, up to `maxRounds` rounds; the rounds that are not needed are
skipped, and a group that never passes leaves limitations on the work.

**Architecture:** The group is unrolled into static tasks when the work is
assigned (`{group}-{step}-{round}`), so every task still runs at most once. A
new module `src/engine/loops.js` holds the rules: unroll, gate passed, skip, the
task that a skipped task stands for, the issues of a round and the limitations.
`startReady` skips, the prompts carry the issues and the limitations, and the
work merger writes the limitations in the work file.

**Tech Stack:** Node.js 22, ES modules, `node:test`, git and `gh` (fake ones in
the e2e test).

**Spec:** the design approved in the conversation of 2026-10-23, written into
the docs by Task 1 (ADR 19 and the arc42 chapters it lists). The design itself
is not kept as a file.

## Global Constraints

- Docs first: Task 1 changes the docs before any code, and every text is shown
  to the user and approved before it is written (`CLAUDE.md`).
- A loop group: `{ name, dependOn?, loop: { maxRounds, steps } }`, with no
  `role`, `instruction`, `dod` or `timeout` of its own.
- `maxRounds` is an integer from 1 to 10.
- `loop.steps` is a straight chain: one step with no `dependOn`, each other step
  depends on exactly one step of the group, and no step is depended on by two.
- A group has at least one gate (`"gate": true`); a gate has a non-empty `dod`;
  a `gate` outside a group is refused; a loop inside a loop is refused.
- The name of a step inside a group is unique in the whole workflow; a step
  outside the group names the group, never a step inside it.
- The id of an unrolled task is `{group}-{step}-{round}`, a slug of at most 63
  characters.
- A gate passes when every item of its `dodChecklist` is `true`.
- A skipped task: `completed: true`, `skipped: true`, no agent, no branch, no
  worktree.
- `limitations`: an array of `{ group, rounds, issues }`, `issues` an array of
  `{ gate, failed, summary }`; written in the work file when the work merger has
  ended; absent when empty.
- The status and the approval status of a work do not change.
- Commit and push only when the user asks.

## Review Focus

- A restart in the middle of a group: reconcile calls `startReady`, which must
  finish the skip cascade without running a skipped task. Test in Task 4.
- A group that is the first step of the workflow (no `dependOn`): the first task
  of round 1 is based on the branch of the work. Test in Task 3 and 4.
- `maxRounds: 1` with a gate that does not pass: the work goes on at once with
  limitations. Test in Task 5.
- A step that depends on a group and on another step: its task merger merges the
  branch of the task that ran last in the group. Test in Task 4.
- A gate that passes in round 1 when it is the first step of the group: no other
  task of the group runs, and nothing is lost. Test in Task 4 and 7.

---

### Task 1: Docs, ADR 19 and the def-process skill

**Files:**

- Create: `docs/09_decisions/0019-workflow-loops.md`
- Modify: `docs/09_decisions/decisions.md`,
  `docs/08_concepts/storage/storage.md` (WORKFLOW_STEP, TASK and WORK fields;
  the rules of a loop group), `docs/05_building-blocks/engine/handlers.md`
  (`work:assign` unrolls; `worker:ended` and the skip; `work-merger:ended`
  writes the limitations), `docs/05_building-blocks/engine/git-adapter.md` (the
  branch of a skipped task), `docs/05_building-blocks/engine/engine.md`
  (`getWork` and `limitations`), `docs/05_building-blocks/orchestrator.md` (the
  field `limitations` of a query; the section `## Limitations` of the pull
  request), `docs/05_building-blocks/agents/claude-process.md` (the issues and
  the limitations in the prompts), `docs/06_runtime/action-flow.md` (a short
  part on a loop), `docs/11_risks-and-debts/risks-and-debts.md` (non-goals: a
  loop in a loop, a timebox by time),
  `superteam-engine/skills/def-process/SKILL.md` (the shape of a loop group,
  with the example of the design).

- [ ] **Step 1: Draft every text, old → new, and show it to the user**
- [ ] **Step 2: Write the approved texts, run `npx prettier --write` on each
      file, and `plantuml -checkonly` on the diagrams that changed**

### Task 2: Check a loop group

**Files:**

- Modify: `superteam-engine/src/lib/storage/validate.js`
- Test: `superteam-engine/src/lib/storage/validate.test.js`

**Interfaces:**

- Produces: `validateWorkflow(workflow)` accepts loop groups and returns the
  reason of the first rule that fails, as today.

- [ ] **Step 1: Write the failing tests** in `validate.test.js`, one `test` for
      each reason, with these exact messages:
  - a valid workflow with the group of the design returns `null`;
  - `step build: maxRounds must be an integer from 1 to 10` for `0`, `11`,
    `1.5`;
  - `step build: a loop group has no role, instruction, dod or timeout`;
  - `step build: loop steps must be a non-empty array`;
  - `step build: the steps of a loop must be a straight chain` (two steps
    without `dependOn`; a step with two dependencies; two steps depending on the
    same step; a `dependOn` naming a step outside the group);
  - `step build: a loop has at least one gate`;
  - `step test: a gate has a non-empty dod`;
  - `step spec: gate is only for a step of a loop`;
  - `step build: a loop has no loop inside it`;
  - `duplicate step name test` when an inner name is used outside;
  - `step release-note depends on unknown step test` when an outer step names an
    inner step;
  - `step build: the id build-test-10 of a task must be a slug of at most 63 characters`
    for a long group name.
- [ ] **Step 2: Run**
      `node --test superteam-engine/src/lib/storage/validate.test.js` **and see
      them fail**
- [ ] **Step 3: Implement** the rules in `validate.js`: a step with `loop` goes
      to a new `validateLoop(step)`; the outer names (for `dependOn` and
      `findCycle`) are the names of the steps and of the groups.
- [ ] **Step 4: Run the tests and see them pass, then `npm test`**

### Task 3: Unroll a group into tasks

**Files:**

- Create: `superteam-engine/src/engine/loops.js`
- Test: `superteam-engine/src/engine/loops.test.js`
- Modify: `superteam-engine/src/engine/tasks.js` (`createTasks`)

**Interfaces:**

- Produces: `unrollSteps(steps) -> step[]`, the steps of a workflow with every
  group replaced by its tasks:
  `{ name: "{group}-{step}-{round}", role, dod, instruction, timeout, dependOn, gate?, group, round }`,
  and the `dependOn` of an outer step that names a group replaced by the last
  task of its last round.
- Produces: `createTasks` copies `gate`, `group` and `round` into a task.

- [ ] **Step 1: Write the failing tests:**
  - `unrollSteps` of the design gives, in order, `spec`, `build-test-1`,
    `build-fixbug-1`, `build-verify-1`, …, `build-verify-3`, `release-note`;
    `build-test-1` depends on `["spec"]`, `build-test-2` on
    `["build-verify-1"]`, `release-note` on `["build-verify-3"]`;
  - a group with no `dependOn` gives a first task with `dependOn: []`;
  - a workflow with no group is returned as it is;
  - `createTasks` keeps `gate: true`, `group: "build"`, `round: 2`.
- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement `unrollSteps`, and call it in `createTasks`**
- [ ] **Step 4: Run them and see them pass, then `npm test`**

### Task 4: Gate, skip and the task that a skipped task stands for

**Files:**

- Modify: `superteam-engine/src/engine/loops.js`,
  `superteam-engine/src/engine/handlers/start-ready.js`,
  `superteam-engine/src/engine/prompt.js`, `superteam-engine/src/engine/jobs.js`
- Test: `superteam-engine/src/engine/loops.test.js`,
  `superteam-engine/src/engine/handlers/start-ready.test.js`,
  `superteam-engine/src/engine/prompt.test.js`

**Interfaces:**

- Produces: `gatePassed(task) -> boolean` (a done gate whose `dodChecklist` is
  all `true`); `skips(task, tasks) -> boolean` (a task of a group that comes
  after a passed gate of its group); `ranTask(id, tasks) -> task` (the task
  itself, or, for a skipped task, the task that ran which its single dependency
  leads back to).
- Consumes: `deps.branches.task(workId, taskId)` (ADR 18).

- [ ] **Step 1: Write the failing tests:**
  - `gatePassed` is true for `[true, true]`, false for `[true, false]` and for a
    task that is not a gate;
  - `startReady`, after `build-test-1` passed: `build-fixbug-1` and every later
    task of `build` are stored `completed: true, skipped: true`, no worktree is
    created for them, no `job:run` is published for them, and `release-note`
    starts on the branch of `build-test-1`;
  - the same after a restart (the tasks of round 1 done, the rest not started):
    `startReady` finishes the cascade;
  - a step that depends on the group and on another step: its task merger prompt
    names the branch of the task that ran last in the group;
  - the work merger prompt names, for a final task that was skipped, the branch
    of the task that ran;
  - a worker that depends on a skipped task gets the artifacts of the task that
    ran.
- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement** the three functions; in `startReady`, repeat until
      no task changes: mark a ready task skipped when `skips` is true, else
      start it as today, with the base `ranTask(dependency)`; in the prompts and
      `targetIds`, map each id through `ranTask`.
- [ ] **Step 4: Run them and see them pass, then `npm test`**

### Task 5: The issues of a round and the limitations in the prompts

**Files:**

- Modify: `superteam-engine/src/engine/loops.js`,
  `superteam-engine/src/engine/prompt.js`
- Test: `superteam-engine/src/engine/loops.test.js`,
  `superteam-engine/src/engine/prompt.test.js`

**Interfaces:**

- Produces: `roundIssues(group, round, tasks) -> issue[]`, the
  `{ gate, failed, summary }` of each done gate of that round that did not pass;
  `limitationsOf(tasks) -> limitation[]`, one `{ group, rounds, issues }` for
  each group whose last round has ended with no gate passed.

- [ ] **Step 1: Write the failing tests:**
  - `roundIssues` gives the DOD items that are `false` as `failed`, and the
    `summary`;
  - `limitationsOf` is `[]` when a gate passed, and gives `rounds: 3` and the
    issues of round 3 when none did; with `maxRounds: 1` it gives the issues of
    round 1;
  - the prompt of the first task of round 2 has a section
    `Issues of the gates of the round before:` with each failed item;
  - the prompt of a task that depends on the group, and of the work merger, has
    a section `Limitations:` when `limitationsOf` is not empty, and none when it
    is.
- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement the two functions and the prompt sections**
- [ ] **Step 4: Run them and see them pass, then `npm test`**

### Task 6: The limitations in the work file, the pull request and the API

**Files:**

- Modify: `superteam-engine/src/engine/handlers/work-merger-ended.js`,
  `superteam-engine/src/engine/handlers/pull-request-body.js`,
  `superteam-engine/src/engine/index.js` (`readWork`)
- Test: the tests of these three files

**Interfaces:**

- Consumes: `limitationsOf(tasks)` (Task 5).
- Produces: `work.limitations` in the work file; `limitations` in the state of
  `getWork` when the work file has it.

- [ ] **Step 1: Write the failing tests:**
  - `work-merger:ended` writes `limitations` in the work file before the commit
    when `limitationsOf` is not empty, and writes no field when it is;
  - `renderPullRequestBody` adds `## Limitations` with one entry for each group
    (its name, its rounds, and for each gate its failed items and summary), and
    lists no DOD for a skipped task;
  - `getWork` of a work whose file has `limitations` returns them, and returns
    no field otherwise.
- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them and see them pass, then `npm test`**

### Task 7: The fake claude and the e2e test of a loop

**Files:**

- Modify: `test/fixtures/fake-claude.js`,
  `superteam-engine/src/orchestrator/e2e.test.js`

**Interfaces:**

- Produces: the fake claude, for a worker, returns one `true` for each item of
  `DOD of the task:` in the prompt, and one `false` for each in the new mode
  `fail-dod`.

- [ ] **Step 1: Write the failing e2e tests**, with a workflow
      `code → build (maxRounds 2: test gate → fix → verify gate)`:
  - `build-test-1` passes: the work is proposed, no agent ran for any task of
    round 2 or for `build-fix-1` and `build-verify-1`, and the pull request has
    no `## Limitations`;
  - every gate in `fail-dod` mode: the work is proposed with `limitations` in
    `GET /works/{id}` (group `build`, `rounds: 2`) and a `## Limitations`
    section in the pull request; approving it merges as usual.
- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Change the fake claude**
- [ ] **Step 4: Run them and see them pass, then `npm test`, `npx eslint .`,
      `prettier --check`, and `claude plugin validate superteam-engine`**
