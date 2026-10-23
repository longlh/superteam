# Superteam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `superteam` plugin: an engine that takes a work, runs it
with a team of `claude` agents on the project's own workflow, and gives the
result back as a merged pull request.

**Architecture:** One Node process holds the orchestrator and three containers
(Engine, Agents, Notifier). The containers do not call each other: the Engine is
active (event loop, handlers, pub/sub), the Agents and the Notifier are
services, and the orchestrator is their only consumer and holds the only door,
the HTTP API. The Connector (MCP server and skills) is a client of that API.
Data is JSON files under `.superteam/`; results live in git branches and pull
requests.

**Tech Stack:** Node.js 24 (ES modules), `node:test`, ESLint and Prettier
(already configured), `git` and `gh` command lines, `claude` command line,
`@modelcontextprotocol/sdk` with `zod` (MCP server only).

**Spec:** `docs/` (chapters 01 to 12). The chapter of each part is named in its
task. The names of functions, events and paths that the docs call "a proposal"
are decided in this plan. The source code that is already in
`superteam-engine/src/` is outdated: this plan does not use it, and builds
everything from the docs. Only the config files (`package.json`,
`eslint.config.mjs`, `.claude-plugin/plugin.json`) are kept.

## Global Constraints

- Code is JavaScript ES modules (`"type": "module"` in
  `superteam-engine/package.json`). Source is in `superteam-engine/src/`. Tests
  sit next to the file they test, as `*.test.js`, so that `npm test`
  (`node --test "superteam-engine/src/**/*.test.js"`) finds them. Shared
  fixtures go in `test/fixtures/`.
- Style is enforced by `npm run lint` (`curly: all`; an object literal with a
  property breaks the line after `{`) and Prettier. Run `npm run lint:fix`
  before every commit.
- Plugin files are in English. Commit messages are one imperative line in the
  style of the history ("Add the storage contract").
- The agents run with the `claude` command, signed in with the account of the
  user: no API key.
- The forge is GitHub, through `gh`. The merge of a pull request is a squash
  merge, and it is the approval.
- One engine for a workspace, in the root workspace, with no UI. The HTTP API
  listens on `127.0.0.1` only, on `SUPERTEAM_PORT` of `.superteam/.env`.
- Data is one JSON file per entity. Persistence is `.superteam/.p/` (in git).
  Runtime is `.superteam/.r/` (not in git). `.superteam/.env` is not in git.
- Ids of a work, a workflow and a step are slugs: lowercase letters and digits
  joined by `-`, up to 63 characters.
- The engine does not create persistence data directly: it writes
  `.superteam/.p/works/{id}.json` in the worktree of the work, and it reaches
  the root branch only by the merge of the pull request.
- Branches: `works/{work_id}` and `tasks/{work_id}/{task_id}`. Worktrees:
  `.superteam/.r/worktrees/works/{work_id}` and
  `.superteam/.r/worktrees/tasks/{work_id}/{task_id}`.
- A failed or rejected work is final: a task is never run again.
- Task `timeout` is in minutes, 720 by default and for the mergers.
- The command of an agent is exactly:
  `claude -p '<prompt>' --agent <role> --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>`.
  `--max-budget-usd` is given only when `SUPERTEAM_MAX_BUDGET_USD` is set. A
  `null` `structured_output` is a result that does not match the schema.
- Statuses: work `OPEN`, `IN_PROGRESS`, `DONE`, `FAILED`; approval `DRAFT`,
  `PROPOSED`, `APPROVED`, `REJECTED`; task `PENDING`, `IN_PROGRESS`, `DONE`,
  `FAILED`. None is stored.

## Review Focus

Inputs and failures that the spec implies and that no task would test by itself.
Each line has its test in the task named at its end.

1. A work `id` with uppercase letters, spaces, `/`, `..` or more than 63
   characters must be refused with `400`, and never reach a branch, a path or a
   command (Task 2, Task 8, Task 12).
2. The same `id` assigned twice before the first event is processed: both
   requests pass the check, so the handler must create the work once (Task 5).
3. A workflow with no step, a `dependOn` that names no step, or a dependency
   cycle must be refused at assign, because it could never finish (Task 2, Task
   8).
4. An agent that exits non-zero, prints invalid JSON, returns
   `structured_output: null`, or runs past its timeout must fail its work, and
   must not hang it (Task 9, Task 6).
5. The same event given twice (`worker:ended`, `work-merger:ended`,
   `work:decide`) and the same `job:run` published twice must change nothing the
   second time (Task 6, Task 7, Task 9).

---

## File Structure

```
superteam-engine/
├── .claude-plugin/plugin.json          (kept)
├── .mcp.json                            Task 14
├── agents/{task-merger,work-merger}.md  Task 10
├── skills/{start,stop,def-role,def-process}/SKILL.md   Tasks 15, 16
└── src/
    ├── lib/engineloop/                  Task 1 (replaces the old folder)
    ├── lib/storage/                     Tasks 2, 4: ids, paths, json files, status, validation, schemas
    ├── engine/
    │   ├── git-adapter.js               Task 3
    │   ├── tasks.js, jobs.js, prompt.js Task 4
    │   ├── handlers/                    Tasks 5, 6, 7: one file for each event, and shared steps
    │   └── pubsub.js, errors.js, index.js   Task 8: the engine and its functions
    ├── agents/                          Task 9: claude-process.js, agent-manager.js, index.js
    ├── notifier/                        Task 11: index.js, google-chat.js
    ├── orchestrator/                    Tasks 12, 13: http-api.js, index.js, main.js
    ├── mcp/                             Task 14: client.js, tools.js, server.js
    └── scripts/                         Tasks 15, 16: start.js, stop.js, seed.js
test/fixtures/                           Tasks 9, 17: fake-claude.js, fake-gh.js
```

## Out of scope (open in `docs/11_risks-and-debts/`)

The Operation Skill (`query-data`, `finish`), a person as a worker, the tasks
query of the API, a limit on the number of agents, and where the subscriptions
are kept. The orchestrator takes `subscriptions` as an argument (Task 13);
`main.js` passes none until the docs decide. A topic of a subscription matches a
notification name exactly (decided here, because the docs leave it open). How
the plugin ships its `node_modules` is not decided either. `WORKFLOW.canApprove`
is kept in the workflow file but not checked, because the docs do not say who
checks it. The stateless API of "Help with code" has no use case.

---

### Task 1: Engine loop

Docs: `05_building-blocks/engine/engineloop.md`,
`09_decisions/0003-one-event-at-a-time.md`.

**Files:**

- Delete: `superteam-engine/src/lib/engineloop/` (the old, outdated folder), and
  the empty placeholders `superteam-engine/src/mcp/index/`,
  `superteam-engine/skills/query-data/` and `test/{engine,lib,mcp}/`
- Create:
  `superteam-engine/src/lib/engineloop/{paths,event,factory,queue,subscribers,handlers,loop,control,index}.js`
  and a `.test.js` for each

**Interfaces:**

- Produces: `index.js` exports
  `createEngineLoop({ baseDir, maxAttempts = 3, pollIntervalMs = 1000, sleep?, now? })`
  returning
  `{ handle(type, handler), enqueue(payload): Promise<event>, subscribe(name, subscriber): () => void, start(): Promise<void>, shutdown(): void }`.
  - Event:
    `{ order, id, payload: { type, data }, createdAt, attempts, errors: { attempt, error, time }[] }`.
    `id` is the SHA-256 hex of `${createdAt}:${order}`.
  - Handler: `(event) => Promise<void>`; it fails when it throws, and an error
    with `retryable === false` goes to the DLQ at once.
  - Notifications: `event:done` `{ event, time }`, `event:retry` and
    `event:error` `{ event, error }` (the event carries the new entry of
    `errors`), `loop:ready` with no event.
  - `subscribers.js` also exports
    `createSubscribers(): { subscribe(name, fn): () => void, emit(name, data): void }`
    (in order, not waited for, a failing subscriber isolated). The pub/sub of
    the Engine reuses it (Task 8).
  - Folders: `.superteam/.r/engineloop/{queue,claim,dlq,tmp}`; queue files are
    `{order padded to 6 digits}.json`; the claim is `claim/{id}.json`; the DLQ
    is `dlq/{id}.json`.

- [ ] **Step 1: Write the failing tests**

  - `event.test.js`: a payload with a `type` that is not a non-empty string, or
    a `data` that is not an object, is refused with a reason; a valid payload
    passes; `order` above `999999` is refused.
  - `factory.test.js`: `create(payload)` gives `order` max plus one (the counter
    is set with `setCounter`; an empty queue starts at 1), `attempts` 0,
    `errors` `[]`, and the `id` above; `createAtHead(payload, attempts, errors)`
    gives `order` 0; creating an event above `999999` throws. The event file is
    written to `tmp/` and then moved into the queue, so a half-written file is
    never in the queue.
  - `queue.test.js` (temp folder): `put`, `claimNext` takes the smallest `order`
    and moves it to `claim/`, `maxOrder` is 0 on an empty queue, `toDlq`,
    `listClaims`, `deleteClaim`.
  - `subscribers.test.js`: order of calls, unsubscribe, a throwing and a
    rejecting subscriber do not stop the others.
  - `handlers.test.js`: one handler per type, a second one for a type throws, a
    handler that is not a function throws.
  - `loop.test.js` (fake `sleep` and `now`): success deletes the claim and emits
    `event:done`; a throwing handler enqueues a new event at order 0 with
    `attempts` plus 1 and the error added to `errors`, emits `event:retry`, and
    the retry waits `2 ** attempts` seconds; at `maxAttempts` (default 3) the
    event goes to the DLQ with the last error in its file and `event:error` is
    emitted; an event with an invalid structure, an event with no handler, and
    an error with `retryable: false` go to the DLQ at once; a claim left by a
    crash is put back at order 0 with the same `attempts` and `errors`, and a
    claim with broken JSON goes to the DLQ with `event:error`; an error of the
    file system inside an iteration (the queue folder removed) is not caught,
    and it rejects `start()` (fail fast, `risks-and-debts.md`).
  - `control.test.js` and `index.test.js`: `start()` creates the folders, clears
    `tmp/`, sets the counter from the queue, recovers the claims, emits
    `loop:ready`, and then loops; `enqueue()` before the start stage is
    rejected; `start()` twice throws; `handle()` after `start()` throws;
    `shutdown()` finishes the iteration in progress and then the loop stops and
    `start()` resolves; the loop installs no signal handler (the orchestrator
    owns the signals, Task 13); events are processed one at a time, in order
    (two handlers never overlap); after a simulated crash (claim left, new loop
    on the same folder) the event is processed again.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/lib/engineloop/*.test.js"` Expected:
  FAIL, modules not found.

- [ ] **Step 3: Delete the old folder, then implement the modules with the
      signatures above**

  The loop (one iteration) and the control (start stage, loop, shutdown,
  `handle`, `enqueue`) are separate modules, and `index.js` only puts them
  together. The loop sleeps `pollIntervalMs` when the queue is empty.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test "superteam-engine/src/lib/engineloop/*.test.js" && npm run lint`
  Expected: PASS, no lint error.

- [ ] **Step 5: Commit**
      `git add -A superteam-engine/src/lib/engineloop && git commit -m "Rebuild the engine loop from its document"`

---

### Task 2: Storage contract

Docs: `08_concepts/storage/storage.md`, `persistence-data.md`,
`runtime-data.md`.

**Files:**

- Create:
  `superteam-engine/src/lib/storage/{ids,paths,files,status,validate}.js` and a
  `.test.js` for each

**Interfaces:**

- Produces:
  - `ids.js`: `isSlug(value: unknown): boolean`; `newWorkId(): string` (8
    lowercase letters and digits); `jobId({ workId, taskId?, kind }): string`
    (`{workId}/{taskId}/{kind}` for `worker` or `task-merger`,
    `{workId}/work-merger` for `work-merger`);
    `parseJobId(id: string): { workId, taskId?, kind }`;
    `artifactId({ workId, taskId, createdAt, index }): string` (the SHA-256 hex
    of `${workId}:${taskId}:${createdAt}:${index}`).
  - `paths.js`: `p(baseDir)`, `r(baseDir)` return the `.superteam/.p` and
    `.superteam/.r` folders; `workFile(dir, id)`, `workflowFile(dir, name)`,
    `taskFile(dir, taskId)`, `artifactsDir(dir, workId)`,
    `worktreeDir(baseDir, { workId, taskId? })`, `agentsDir(baseDir)` (all
    string paths; `dir` is a root workspace or a worktree).
  - `files.js`: `readJson(file): Promise<object | null>` (null when missing);
    `writeJson(file, value): Promise<void>` (atomic: temp file, then rename;
    creates folders); `listJson(dir): Promise<object[]>`.
  - `status.js`: `taskStatus(task, tasks): string`;
    `workStatus({ work, tasks, proposed }): string`;
    `approvalStatus(pr: { state } | null): string`.
  - `validate.js`: `validateAssignBody(body): string | null`;
    `validateWorkflow(workflow): string | null`. Both return the reason or
    `null`.

- [ ] **Step 1: Write the failing tests**

  - `ids.test.js`: `isSlug("add-login-page")` true; false for `"Add"`, `"a b"`,
    `"a/b"`, `".."`, `""`, `"-a"`, `"a-"`, `"a--b"`, and a 64-character string;
    true for a 63-character one. `newWorkId()` matches `/^[a-z0-9]{8}$/`.
    `parseJobId(jobId({ workId: "w", taskId: "t", kind: "worker" }))` equals
    `{ workId: "w", taskId: "t", kind: "worker" }`, and the same for
    `work-merger` with no `taskId`. `artifactId` is 64 hex characters, and it
    changes when any one of its four inputs changes.
  - `paths.test.js`: `workFile("/x", "w")` is `/x/.superteam/.p/works/w.json`;
    `worktreeDir("/x", { workId: "w" })` is
    `/x/.superteam/.r/worktrees/works/w`; with `taskId: "t"` it is
    `/x/.superteam/.r/worktrees/tasks/w/t`; `taskFile` is under
    `.superteam/.r/tasks/`.
  - `files.test.js` (temp folder): `readJson` of a missing file is `null`;
    `writeJson` then `readJson` round-trips and leaves no temp file; `listJson`
    of a missing folder is `[]`.
  - `status.test.js`: the full table of `storage.md`. Task: `PENDING` (a
    dependency not `DONE`), `IN_PROGRESS`, `DONE`, `FAILED`, and a task that
    depends on a failed task is `PENDING`. Work: `OPEN` (no tasks),
    `IN_PROGRESS`, `DONE` (all completed, or `proposed`), `FAILED` (`error`,
    even with tasks). Approval: `null` is `DRAFT`, `open` is `PROPOSED`,
    `merged` is `APPROVED`, `closed` is `REJECTED`.
  - `validate.test.js`: a valid assign body (`workflow`, `title`) gives `null`;
    refused (non-null): a missing `title`, an `id` that is not a slug, a
    non-array `dod`, a body that is not an object. A valid workflow gives
    `null`; refused: no steps, a step name that is not a slug, a duplicate step
    name, `dependOn` naming no step, a cycle (`a` depends on `b`, `b` on `a`), a
    `timeout` that is not a positive integer.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/lib/storage/*.test.js"` Expected:
  FAIL, modules not found.

- [ ] **Step 3: Implement the modules with the signatures above**

  `writeJson` writes to `{file}.{random}.tmp` and renames. `validateWorkflow`
  finds a cycle with a depth-first search. Workflow shape: the `WORKFLOW` and
  `WORKFLOW_STEP` entities of `storage.md`, with the steps as an array `steps`
  in the workflow file.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test "superteam-engine/src/lib/storage/*.test.js" && npm run lint`
  Expected: PASS, no lint error.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/lib/storage && git commit -m "Add the storage contract: ids, paths, files, status and validation"`

---

### Task 3: Git adapter

Docs: `05_building-blocks/engine/git-adapter.md`.

**Files:**

- Create: `superteam-engine/src/engine/git-adapter.js`, `git-adapter.test.js`

**Interfaces:**

- Consumes: nothing from earlier tasks (callers build the folders with
  `worktreeDir` of Task 2).
- Produces: `createGitAdapter({ baseDir, run? }): GitAdapter`, where
  `run(command, args, { cwd }): Promise<{ stdout: string }>` defaults to
  `node:child_process` `execFile` and rejects on a non-zero exit. The adapter
  has:
  - `rootBranch(): Promise<string>` (the current branch of `baseDir`)
  - `fetch(): Promise<void>` (`git fetch --prune origin`)
  - `createWorktree({ folder, branch, base }): Promise<void>` (a new branch
    `branch` from `base`; if `folder` already exists, does nothing)
  - `removeWorktree(folder): Promise<void>` (no error if it is gone)
  - `commitAll(folder, message): Promise<boolean>` (`false` and no commit when
    nothing changed)
  - `push(branch): Promise<void>`
  - `branchExists(branch): Promise<boolean>` (local or `origin`)
  - `deleteBranch(branch): Promise<void>` (local and remote, no error when
    missing)
  - `listBranches(prefix): Promise<string[]>` (`origin` branches that start with
    `prefix`)
  - `readFileOnBranch(branch, path): Promise<string | null>`
  - `getPullRequest(branch): Promise<{ url, state: "open" | "merged" | "closed" } | null>`
  - `openPullRequest({ branch, title, body }): Promise<string>` (the URL)
  - `mergePullRequest(branch)`, `closePullRequest(branch)`,
    `pullRoot(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

  Git parts use a real temp repository with a bare `origin` (helper `makeRepo()`
  in the test file): `createWorktree` makes the folder and the branch; a second
  call does nothing; `commitAll` is `false` on a clean tree and `true` after a
  file is added; `push` then `branchExists` is true and
  `readFileOnBranch("works/a", ".superteam/.p/works/a.json")` returns the text,
  and `null` for a missing file; `deleteBranch` removes it locally and on
  `origin` and does not throw when called again; `listBranches("works/")`
  returns the pushed ones; a branch pushed from a second clone is in
  `listBranches` only after `fetch`. The `gh` parts use a fake `run` that
  records calls and answers: `openPullRequest` runs
  `gh pr create --head works/a --title T --body B` and returns the URL printed;
  `getPullRequest` runs `gh pr view works/a --json url,state` and maps `OPEN`,
  `MERGED`, `CLOSED` to `open`, `merged`, `closed`, and returns `null` when `gh`
  fails with "no pull requests found"; `mergePullRequest` runs
  `gh pr merge works/a --squash`; `closePullRequest` runs `gh pr close works/a`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test superteam-engine/src/engine/git-adapter.test.js` Expected:
  FAIL, module not found.

- [ ] **Step 3: Implement `createGitAdapter`**

  Every `git` and `gh` call goes through `run`, with arguments as an array
  (never a shell string), so a branch name is never interpreted by a shell.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test superteam-engine/src/engine/git-adapter.test.js && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/engine/git-adapter* && git commit -m "Add the git adapter for git and gh"`

---

### Task 4: Task graph, jobs and prompts

Docs: `engine.md` ("Functions": the job and its result), `claude-process.md`
("Component": the prompt), `storage.md`.

**Files:**

- Create: `superteam-engine/src/engine/tasks.js`, `jobs.js`, `prompt.js`,
  `src/lib/storage/schemas.js`, and `src/scripts/artifact.js`, each with a
  `.test.js`

**Interfaces:**

- Consumes: `taskFile`, `readJson`, `writeJson`, `listJson`, `jobId`,
  `taskStatus` (Task 2).
- Produces:
  - `tasks.js`: `createTasks(work, workflow, now: Date): TASK[]` (one task for
    each step: `id` = step name, `title` = step name, `assignee` = `step.role`,
    `timeout` = step timeout or 720, `dependOn`, `dod`, `instruction`,
    `description`, `work` = work id, `createdAt`, `updatedAt`);
    `createTaskStore(worktreeFolder): { list(): Promise<TASK[]>, get(id): Promise<TASK | null>, put(task): Promise<void> }`
    (files in `.superteam/.r/tasks/` of the worktree);
    `finalTasks(tasks): TASK[]` (tasks that no other task depends on).
  - `jobs.js`:
    `buildJob({ kind, work, task?, tasks, workdir, artifacts? }): Job` (it
    passes `artifacts`, default `[]`, to `buildPrompt`) with
    `Job = { id, role, timeout, workdir, schema, instruction: { target, targetIds, prompt } }`
    as in `engine.md`. Roles: `task.assignee` for `worker`, `"task-merger"`,
    `"work-merger"`. Timeout: `task.timeout` for a worker, 720 for a merger.
  - `prompt.js`: `buildPrompt({ kind, work, task?, tasks, artifacts }): string`.
    Worker prompt holds the task `instruction`, the work title and description,
    the DOD of the work and of the task as a numbered list, the `summary` of the
    task when a merger wrote one, and each artifact of the tasks it depends on
    as one line. A merger prompt holds the line
    `Branches to merge: <comma separated branches>`: the other dependencies of
    the task for a task merger, the final tasks for the work merger, each as
    `tasks/{work}/{task}`. A worker prompt also holds the line
    `To create an artifact, run: node <absolute path of artifact.js> <workId> <taskId> <content>`.
  - `artifact.js` (the standalone script of "Help with code" in `agents.md`):
    `writeArtifacts({ dir, workId, taskId, contents: string[], now? }): Promise<string[]>`
    writes one `ARTIFACT` `{ id, task, work, createdAt, content }` for each
    content to `artifactsDir(dir, workId)/{id}.json`, where `id` is `artifactId`
    with `index` the position in `contents`, and returns the paths. Run with
    `node artifact.js <workId> <taskId> <content>...`, it uses the current
    folder as `dir`. It never overwrites a file.
  - `schemas.js`: `jobSchema("TASK" | "WORK"): object`, a JSON schema
    `{ summary: string, data: <entity> }`, both required; `data` only allows the
    fields a job may write: `dodChecklist` (array of boolean).

- [ ] **Step 1: Write the failing tests**

  `createTasks` for steps `a` and `b` (depends on `a`) gives two tasks with
  `dependOn: ["a"]` on `b`, `timeout` 720 on a step with none and the step value
  on another; `taskStatus` of `b` is `PENDING` until `a` is completed. The store
  round-trips a task and `list()` of an empty worktree is `[]`. `finalTasks` of
  a diamond (`a` to `b` and `c`, both to `d`) is `[d]`. `buildJob` gives `id`
  `w/a/worker`, `w/d/task-merger`, `w/work-merger`, with `timeout` 720 for the
  mergers, and `instruction.target` `task`, `merge`, `work`. `buildPrompt` for a
  worker contains the instruction, the title and `1. ` for the first DOD item;
  for a task merger it contains `Branches to merge: tasks/w/a, tasks/w/c`; for
  the work merger `Branches to merge: tasks/w/d`. `jobSchema("TASK")` has
  `required: ["summary", "data"]` and a `data.properties.dodChecklist` of
  boolean items. `writeArtifacts` with two contents writes two files with
  different ids, the same `createdAt`, and the fields `task`, `work` and
  `content`; it refuses a `workId` or a `taskId` that is not a slug. A worker
  prompt contains `To create an artifact, run: node ` and the content of each
  artifact that it is given.

- [ ] **Step 2: Run to verify they fail**

  Run:
  `node --test superteam-engine/src/engine/{tasks,jobs,prompt}.test.js superteam-engine/src/lib/storage/schemas.test.js superteam-engine/src/scripts/artifact.test.js`
  Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the modules**

  The prompt is plain text, built from the parts in the order above. The job
  `id` always comes from `jobId`.

- [ ] **Step 4: Run to verify they pass**

  Run: `npm test && npm run lint` Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src && git commit -m "Add the task graph, the jobs and their prompts"`

---

### Task 5: Handler `work:assign`

Docs: `handlers.md`, `action-flow.md` ("Assign and run a work").

**Files:**

- Create: `superteam-engine/src/engine/handlers/{index,assign,start-ready}.js`
  and `assign.test.js`

**Interfaces:**

- Consumes: Tasks 2 to 4 (the git adapter is replaced by a fake in the tests).
- Produces:
  - `index.js`:
    `createEngineHandlers(deps): { [eventType: string]: (event) => Promise<void> }`,
    with
    `deps = { baseDir, git, loadWorkflow(name): Promise<WORKFLOW | null>, publish(topic, data): void, now(): Date }`.
    Each event type is added by its own task; this task adds `"work:assign"`.
  - Event payload data of `work:assign`:
    `{ id, workflow, title, description?, dod? }`.
  - `start-ready.js`: `startReady({ deps, workId }): Promise<void>`: for each
    task that is `IN_PROGRESS` and has no worktree yet, creates its worktree
    (branch `tasks/{work}/{task}`, based on `tasks/{work}/{first dependency}`,
    or the root branch when it has none) and publishes `job:run` with
    `buildJob`: kind `task-merger` when the task has more than one dependency
    (its `instruction.targetIds` are the other dependencies), otherwise
    `worker`. Before a `job:run` of a worker it reads the artifacts with
    `listJson(artifactsDir(taskWorktree, workId))` and keeps those whose `task`
    is in the `dependOn` of the task. Exported for Tasks 6 and 7.

- [ ] **Step 1: Write the failing tests**

  With a fake `git` (records calls and creates the folders) and a temp
  `baseDir`: handling `work:assign` for a workflow `a`, `b` (depends on `a`)
  creates the worktree of the work from the root branch, writes
  `.superteam/.p/works/{id}.json` in it with `dod` taken from the workflow when
  the body has none, commits it, writes the two tasks, and publishes exactly one
  `job:run`, for the worker of `a` (`b` is `PENDING`). A workflow whose step has
  two dependencies publishes `job:run` for a `task-merger` first. Handling the
  same event twice, and a crash simulated between the worktree and the tasks
  (worktree and work file exist, tasks do not), leave one work file, one set of
  tasks and no second worktree. **Review Focus 2:** two `work:assign` events
  with the same `id` create the work once. An unknown workflow throws an error
  with `retryable: false`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test superteam-engine/src/engine/handlers/assign.test.js`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `createEngineHandlers` and the handler of
      `work:assign`**

  Each step checks that it is not done yet (worktree exists, work file exists,
  tasks exist), as the two rules of `engineloop.md` require.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test "superteam-engine/src/engine/handlers/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/engine/handlers && git commit -m "Add the handler that assigns a work and starts its ready tasks"`

---

### Task 6: Handlers `worker:ended` and `task-merger:ended`, and the failure of a work

Docs: `handlers.md`, `action-flow.md` ("A job fails"), `ADR 11`.

**Files:**

- Create:
  `superteam-engine/src/engine/handlers/{worker-ended,task-merger-ended,fail-work}.js`
  and a `.test.js` for each
- Modify: `superteam-engine/src/engine/handlers/index.js` (register both types)

**Interfaces:**

- Consumes: `startReady` (Task 5), `parseJobId`, `jobSchema`, `buildJob`, the
  task store.
- Produces:
  - Event data of the ended events: `{ jobId, summary?, data?, error? }`, the
    same for the three kinds.
  - `fail-work.js`: `failWork({ deps, workId, error }): Promise<void>`:
    publishes `job:stop` with `{ workId }`; writes `error` in the work file of
    the worktree and commits it; pushes `works/{id}`; removes the worktrees of
    the tasks and of the work; deletes the branches `tasks/{id}/*`. It does
    nothing if the work file already has an `error`.

- [ ] **Step 1: Write the failing tests**

  `worker:ended` with a result: the task becomes completed with `summary`,
  `completedAt` and the `dodChecklist` of `data` (no other field of `data` is
  written), its branch is pushed, its worktree is removed, and the next ready
  task gets a `job:run`, whose prompt holds the content of the artifact that the
  ended task committed. When the last task is done, `job:run` is published for
  the `work-merger` with `workdir` the worktree of the work. With an `error`,
  the task is written `completed: true` with the `error` and `completedAt` (so
  it is `FAILED`), then `failWork` runs: `job:stop` is published, the work file
  has the `error`, the branch of the work is pushed and the task branches are
  deleted. **Review Focus 5:** the same `worker:ended` twice does nothing the
  second time; a `worker:ended` for a work whose worktree is gone is ignored.
  `task-merger:ended` writes the `summary` in the task and publishes `job:run`
  for its worker; with an `error` it fails the work.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/engine/handlers/*.test.js"` Expected:
  FAIL for the new tests.

- [ ] **Step 3: Implement the two handlers and `failWork`**

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test "superteam-engine/src/engine/handlers/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/engine/handlers && git commit -m "Add the handlers for the end of a worker and of a task merger"`

---

### Task 7: Handlers `work-merger:ended`, `work:decide` and `work:archive`

Docs: `handlers.md`, `action-flow.md` ("Decide a work", "Archive a work"),
`ADR 1`, `ADR 11`.

**Files:**

- Create:
  `superteam-engine/src/engine/handlers/{work-merger-ended,decide,archive,pull-request-body}.js`
  and a `.test.js` for each
- Modify: `superteam-engine/src/engine/handlers/index.js`

**Interfaces:**

- Consumes: `failWork` (Task 6), the git adapter.
- Produces:
  - `pull-request-body.js`:
    `renderPullRequestBody({ summary, work, tasks }): string`: the `summary`,
    then `## Work DOD` with one `- [x] item` or `- [ ] item` per item of
    `work.dod` by `work.dodChecklist`, then `## Task \`{id}\` DOD` with the same
    list for each task that has a DOD.
  - Event data: `work:decide` is `{ id, decision: "approve" | "reject" }`;
    `work:archive` is `{ id }`.

- [ ] **Step 1: Write the failing tests**

  `renderPullRequestBody` with a summary, a work DOD `["ok", "docs"]` with
  checklist `[true, false]` gives exactly
  `"S\n\n## Work DOD\n\n- [x] ok\n- [ ] docs\n"` followed by the section of each
  task. `work-merger:ended` with a result: the `dodChecklist` is written in the
  work and committed, the branch is pushed, a pull request is opened with that
  body, and the worktree of the work is removed; run twice, only one pull
  request is opened (`getPullRequest` already returns one). With an `error` it
  fails the work. `work:decide` `approve`: merges the pull request, pulls the
  root branch, deletes `works/{id}` and every `tasks/{id}/*` branch; already
  merged, it does nothing; a work whose pull request is not open throws with
  `retryable: false`. `reject`: closes the pull request, deletes only the task
  branches and keeps `works/{id}`. `work:archive`: for a failed work (branch
  exists, no pull request) and for a rejected one (pull request `closed`)
  deletes the branch of the work; for any other state throws with
  `retryable: false`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/engine/handlers/*.test.js"` Expected:
  FAIL for the new tests.

- [ ] **Step 3: Implement the handlers and `renderPullRequestBody`**

  Before each git or forge step the handler reads the state (pull request,
  branch) so that a repeated event does nothing.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test "superteam-engine/src/engine/handlers/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/engine/handlers && git commit -m "Add the handlers that propose, decide and archive a work"`

---

### Task 8: The Engine: functions and pub/sub

Docs: `engine.md`, `pubsub.md`, `orchestrator.md` ("How a request becomes a
call").

**Files:**

- Create: `superteam-engine/src/engine/{errors,pubsub,index}.js` and a
  `.test.js` for each

**Interfaces:**

- Consumes: `createEngineLoop` (Task 1), `createEngineHandlers` (Tasks 5 to 7),
  `createGitAdapter` (Task 3), `validateAssignBody`, `newWorkId`, `workStatus`,
  `approvalStatus`, `buildJob`.
- Produces:
  - `errors.js`:
    `class EngineError extends Error { code: "invalid" | "not-found" | "conflict" | "unavailable" }`.
  - `pubsub.js`:
    `createPubSub(): { subscribe(topic, callback): () => void, publish(topic, data): void }`.
    It reuses `createSubscribers` of the engine loop: exact topic match,
    subscribers called in order, not waited for, a failing subscriber isolated.
  - `index.js`: `createEngine({ baseDir, git?, loopOptions? }): Engine` with
    `assign(body): Promise<{ id, eventId }>`,
    `decide(id, decision): Promise<{ eventId }>`,
    `archive(id): Promise<{ eventId }>`, `getWork(id): Promise<WorkState>`,
    `listWorks(): Promise<WorkState[]>`,
    `jobEnded(result: { id, summary?, data?, error? }): Promise<void>`,
    `reconcile(jobs: Job[]): Promise<void>`, `subscribe(topic, callback)`,
    `start(): Promise<void>`, `shutdown(): void`.
    `WorkState = { id, title, workflow, status, approvalStatus, pullRequest?, error? }`.
  - The engine publishes `engine:ready` when the loop emits `loop:ready`, and
    relays `event:done`, `event:retry`, `event:error` of the loop to its pub/sub
    under the same names.

- [ ] **Step 1: Write the failing tests**

  `pubsub.test.js`: `publish` reaches the subscribers of the topic only, in
  order; an unsubscribed one is not called; a throwing subscriber does not stop
  the others. `index.test.js` (fake `git`, real temp `baseDir`, real loop):
  - `assign`: **Review Focus 1 and 3:** a bad id, a missing title, an unknown
    workflow (`not-found`), a workflow with a cycle (`invalid`), and an `id`
    that is used (branch, root work file, or pull request exists: `conflict`)
    each throw an `EngineError` of the code shown; before `start` is ready it
    throws `unavailable`. A valid body returns the given `id`, or a new slug,
    and an `eventId`.
  - `decide` throws `conflict` unless the pull request is `open`; `archive`
    throws `conflict` unless the work is `FAILED` or `REJECTED`; unknown id is
    `not-found`.
  - `getWork` and `listWorks` call `git.fetch()` first. `getWork` reads the
    worktree on this machine first, then the branch on `origin`, then the root
    workspace, and derives `status` and `approvalStatus`; `listWorks` merges the
    three sources with no duplicate, the first source winning.
  - `jobEnded` enqueues `worker:ended`, `task-merger:ended` or
    `work-merger:ended` by the kind of the job id.
  - `reconcile`: for a started task or a work merger that is in the killed list
    it enqueues the ended event with `error: "the agent was killed"`; for a job
    the engine waits for and that is not in the list it publishes `job:run`
    again.
  - `engine:ready` is published once the loop is ready; the loop notifications
    are relayed.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/engine/*.test.js"` Expected: FAIL.

- [ ] **Step 3: Implement**

  The engine's `loadWorkflow` reads `workflowFile(baseDir, name)`. Jobs that the
  engine waits for are rebuilt from the disk with `buildJob`.

- [ ] **Step 4: Run to verify they pass**

  Run: `npm test && npm run lint` Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src && git commit -m "Add the Engine with its functions and its pub/sub"`

---

### Task 9: Agents: the Claude process and the agent manager

Docs: `agents.md`, `agent-manager.md`, `claude-process.md`, `ADR 8`.

**Files:**

- Create: `superteam-engine/src/agents/{claude-process,agent-manager,index}.js`
  with a `.test.js` each, and `test/fixtures/fake-claude.js`

**Interfaces:**

- Consumes: `agentsDir`, `readJson`, `writeJson` (Task 2); the `Job` shape (Task
  4).
- Produces:
  - `claude-process.js`:
    `buildCommand(job, { maxBudgetUsd? }): { command: "claude", args: string[] }`
    (the exact command of the Global Constraints);
    `parseResult(stdout, exitCode): { summary, data } | { error: string }`.
  - `agent-manager.js`:
    `createAgentManager({ baseDir, command = "claude", spawn?, env?, maxBudgetUsd? }): { run(job, onEnded), stopWork(workId), stopAll(), recover(): Promise<Job[]> }`
    and `index.js` exports it as `createAgents`. `onEnded` is called with
    `{ id: job.id, summary, data }` or `{ id: job.id, error }`.
  - `test/fixtures/fake-claude.js`: a Node script that behaves as `claude -p`:
    its mode comes from the env `FAKE_CLAUDE_MODE` (`ok`, `fail`, `null-output`,
    `bad-json`, `hang`).

- [ ] **Step 1: Write the failing tests**

  `parseResult`: valid JSON with `structured_output` gives `{ summary, data }`;
  **Review Focus 4:** `structured_output: null`, `is_error: true`, non-JSON
  text, and a non-zero exit code each give `{ error }` with a reason.
  `buildCommand` has `--agent` set to the role, `--permission-mode dontAsk`, the
  schema as one JSON string argument, and `--max-budget-usd` only when
  `maxBudgetUsd` is given. Agent manager, with the fake `claude` as `command`:
  `run` writes `.superteam/.r/agents/{pid}.pid` with `{ pid, job }`, calls
  `onEnded` first and deletes the file after; a job with the same id that is
  running is not run again (**Review Focus 5**), and neither is a job whose id
  is in a pid file of a live process (the manager reads the pid files before it
  spawns, as `agent-manager.md` says); a job that outlives its `timeout` (use a
  timeout of a few milliseconds, mode `hang`) is killed with its process group
  and ends with an `error` that names the timeout; `stopWork` kills the agents
  of that work, deletes their files and does not call `onEnded`; `stopAll` kills
  all and leaves the pid files; `recover()` kills a live pid from a file, and
  returns the jobs of all the files (and removes them).

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/agents/*.test.js"` Expected: FAIL.

- [ ] **Step 3: Implement**

  Spawn with `detached: true`, `cwd: job.workdir`,
  `stdio: ["ignore", "pipe", "pipe"]`, so the agent is its own process group;
  kill with `process.kill(-pid, "SIGKILL")`.

- [ ] **Step 4: Run to verify they pass**

  Run: `node --test "superteam-engine/src/agents/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/agents test/fixtures && git commit -m "Add the Agents: the claude process and the agent manager"`

---

### Task 10: Agent files of the mergers

Docs: `agents.md` ("The mergers"), `ADR 4`, `ADR 14`.

**Files:**

- Create: `superteam-engine/agents/task-merger.md`,
  `superteam-engine/agents/work-merger.md`,
  `superteam-engine/src/agents/merger-files.test.js`

- [ ] **Step 1: Write the failing test**

  For each file: the header has `name` equal to the file name, a non-empty
  `description`, a `tools` line that contains `Bash` and `StructuredOutput`, and
  a `model`.

- [ ] **Step 2: Run to verify it fails**

  Run: `node --test superteam-engine/src/agents/merger-files.test.js` Expected:
  FAIL, files not found.

- [ ] **Step 3: Write the two files**

  Both headers have
  `tools: Bash, Read, Edit, Write, Grep, Glob, StructuredOutput`. The task
  merger merges the branches of the line `Branches to merge:` into the current
  branch, resolves the conflicts itself, commits, and returns
  `{ summary, data: {} }` where `summary` says what it merged and which
  conflicts it resolved. The work merger merges the same way, then checks the
  work against its DOD and returns `data.dodChecklist`, one boolean for each
  item of the DOD of the work.

- [ ] **Step 4: Run to verify it passes**

  Run: `node --test superteam-engine/src/agents/merger-files.test.js` Expected:
  PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/agents superteam-engine/src/agents && git commit -m "Add the agent files of the task merger and the work merger"`

---

### Task 11: Notifier and Google Chat

Docs: `notifier.md`, `google-chat.md`.

**Files:**

- Create: `superteam-engine/src/notifier/{index,google-chat}.js` and a
  `.test.js` each

**Interfaces:**

- Produces:
  - `google-chat.js`:
    `createGoogleChat({ webhookUrl, fetch = globalThis.fetch, timeoutMs = 10000 }): { post(message): Promise<boolean> }`;
    `fromEnv(config: { webhook: string }, env): GoogleChat` (the config maps the
    name `webhook` to an environment variable, such as
    `SUPERTEAM_GCHAT_WEBHOOK`).
  - `index.js`:
    `createNotifier({ channels }): { send(composeMessage: () => string | Promise<string>): Promise<void>, composeMessage(event, context: { getWork }): Promise<string> }`.

- [ ] **Step 1: Write the failing tests**

  `post` sends `POST` with the JSON body `{ "text": message }` and returns
  `true`; a rejected `fetch`, a non-2xx answer, and a `fetch` that does not
  answer within `timeoutMs` each return `false` and do not throw.
  `fromEnv({ webhook: "X" }, { X: "https://h" })` posts to `https://h`; a
  missing variable throws a clear error. `send` calls `composeMessage()` once
  and gives the text to every channel; a channel that fails does not stop the
  others and `send` does not throw.
  `composeMessage({ payload: { type: "work:assign", data: { id: "w" } } }, { getWork })`
  with `getWork` resolving `{ title: "T", status: "OPEN" }` gives
  `work:assign: w "T" (OPEN)`; for a `worker:ended` event the work id is read
  from `data.jobId`; for an `event:error` shape (`{ event, error }`) the text
  ends with `: <error>`; when `getWork` throws, the text is still built, without
  the title and the status.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/notifier/*.test.js"` Expected: FAIL.

- [ ] **Step 3: Implement** with `AbortSignal.timeout(timeoutMs)` for the 10
      second limit.

- [ ] **Step 4: Run to verify they pass**

  Run: `node --test "superteam-engine/src/notifier/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/notifier && git commit -m "Add the Notifier and the Google Chat channel"`

---

### Task 12: HTTP API

Docs: `orchestrator.md` ("HTTP API", "Errors").

**Files:**

- Create: `superteam-engine/src/orchestrator/http-api.js`, `http-api.test.js`

**Interfaces:**

- Consumes: `EngineError` (Task 8), `isSlug` (Task 2).
- Produces:
  `createHttpApi({ engine }): { listen(port): Promise<{ port }>, close(): Promise<void> }`.
  It listens on `127.0.0.1` only. Routes: `POST /works` to `engine.assign`;
  `POST /works/{id}/decision` (body `{ decision }`) to `engine.decide`;
  `POST /works/{id}/archive` to `engine.archive`; `GET /works/{id}` to
  `engine.getWork`; `GET /works` to `engine.listWorks`. Commands answer `202`
  with the result, queries `200`. `EngineError` codes: `invalid` is `400`,
  `not-found` is `404`, `conflict` is `409`, `unavailable` is `503`.

- [ ] **Step 1: Write the failing tests**

  With a fake engine and `listen(0)`: each route calls the right function with
  the right arguments and returns the right status and body; each `EngineError`
  code gives its status with `{ error: message }`; a body that is not JSON is
  `400` and the engine is not called (**Review Focus 1**: an `id` in the path
  such as `..%2Fx` is `404` or `400`, never given to the engine); an unknown
  path or method is `404`; a decision that is neither `approve` nor `reject` is
  `400`; the server address is `127.0.0.1`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test superteam-engine/src/orchestrator/http-api.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement** with `node:http`, a body limit of 1 MB, and `isSlug`
      on the `id` of the path.

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test superteam-engine/src/orchestrator/http-api.test.js && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/orchestrator && git commit -m "Add the HTTP API of the orchestrator"`

---

### Task 13: Orchestrator: wiring, start, shutdown, `main.js`

Docs: `orchestrator.md` ("Connections", "Subscriptions", "Start", "Shutdown"),
`action-flow.md` ("Start and shutdown", "Notify").

**Files:**

- Create: `superteam-engine/src/orchestrator/{index,main}.js`, `index.test.js`

**Interfaces:**

- Consumes: Engine (Task 8), Agents (Task 9), Notifier (Task 11), HTTP API (Task
  12).
- Produces:
  `createOrchestrator({ baseDir, port, maxBudgetUsd?, subscriptions = [], engine?, agents?, notifier?, httpApi? }): { start(): Promise<void>, shutdown(): Promise<void> }`
  (the optional parts are for tests; `maxBudgetUsd` is given to `createAgents`).
  `subscriptions` is `{ topic, addon: "notifier", env }[]`. `start()` does not
  wait for `engine.start()`, which resolves only after the shutdown: it keeps
  that promise, waits for `engine:ready`, then calls `agents.recover()` and
  `engine.reconcile(jobs)` (which enqueue, so they need the start stage), then
  opens the API, and resolves. `shutdown()` resolves when the promise of
  `engine.start()` resolves.
  `handleSignals({ shutdown, on = process.on.bind(process), exit = process.exit })`
  is exported too: the first `SIGINT` or `SIGTERM` calls `shutdown()`, the
  second calls `exit(130)`. `main.js` loads `{cwd}/.superteam/.env` with
  `process.loadEnvFile`, reads `SUPERTEAM_PORT` (exits with a message if it is
  missing) and `SUPERTEAM_MAX_BUDGET_USD` (a number, or absent), calls
  `createOrchestrator(...).start()`, and calls `handleSignals`.

- [ ] **Step 1: Write the failing tests**

  With fakes: `start` subscribes to `engine:ready`, `job:run`, `job:stop` and
  each subscription topic **before** `engine.start()`; calls `agents.recover()`
  and gives its jobs to `engine.reconcile` only after `engine:ready`, and opens
  the API after that; `start()` resolves while the engine is still running.
  `maxBudgetUsd` reaches `createAgents`. `job:run` calls
  `agents.run(job, onEnded)` and `onEnded(result)` calls
  `engine.jobEnded(result)`. `job:stop` calls `agents.stopWork(workId)`. A
  notification of a subscription topic calls `notifier.send(fn)` where `fn()`
  calls `notifier.composeMessage(event, { getWork })` with `engine.getWork`.
  `shutdown` closes the API, calls `agents.stopAll()`, then `engine.shutdown()`.
  An `addon` other than `notifier` throws at `start`. `handleSignals` with a
  fake `on` and `exit`: the first signal calls `shutdown` once, the second calls
  `exit(130)`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test superteam-engine/src/orchestrator/index.test.js` Expected:
  FAIL.

- [ ] **Step 3: Implement** the orchestrator with no logic of its own: it only
      calls, in the order of the table of "Connections".

- [ ] **Step 4: Run to verify they pass**

  Run:
  `node --test superteam-engine/src/orchestrator/index.test.js && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine/src/orchestrator && git commit -m "Add the orchestrator that connects the containers"`

---

### Task 14: MCP server

Docs: `mcp-server.md`.

**Files:**

- Create: `superteam-engine/src/mcp/{client,tools,server}.js`, `client.test.js`,
  `tools.test.js`, `superteam-engine/.mcp.json`
- Modify: `superteam-engine/package.json` (dependencies:
  `@modelcontextprotocol/sdk`, `zod`; run `npm install` in `superteam-engine`)

**Interfaces:**

- Produces: `client.js`:
  `createApiClient({ baseUrl, fetch? }): { request(method, path, body?): Promise<{ status, body }> }`.
  `tools.js`:
  `createTools({ request }): { name, description, inputSchema, handler(input) }[]`
  with the names `assign_work`, `decide_work` (`id`, `decision`),
  `archive_work`, `get_work`, `list_works`: each one sends its request and gives
  the answer back, with no other logic. `server.js` starts a stdio MCP server,
  reading `SUPERTEAM_PORT` from `.superteam/.env` of its working folder, and
  `.mcp.json` registers it as `superteam` with
  `node ${CLAUDE_PLUGIN_ROOT}/src/mcp/server.js`.

- [ ] **Step 1: Write the failing tests**

  `tools.test.js` with a fake `request`: each tool sends exactly the method and
  path of the table in `mcp-server.md` (for example `decide_work` sends
  `POST /works/w/decision` with `{ decision: "approve" }`) and returns the
  status and body unchanged, including a `409`. `client.test.js`: it targets
  `http://127.0.0.1:{port}`, and a refused connection gives a clear error that
  says the orchestrator is not running.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/mcp/*.test.js"` Expected: FAIL.

- [ ] **Step 3: Implement** the three files and register each tool in
      `server.js` with the SDK.

- [ ] **Step 4: Run to verify they pass**

  Run: `node --test "superteam-engine/src/mcp/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine && git commit -m "Add the MCP server, a client of the HTTP API"`

---

### Task 15: Control Skill: start and stop

Docs: `control-skill.md`.

**Files:**

- Create: `superteam-engine/src/scripts/{start,stop}.js` with `.test.js`,
  `superteam-engine/skills/start/SKILL.md`,
  `superteam-engine/skills/stop/SKILL.md`

**Interfaces:**

- Produces: `start.js`:
  `startSuperteam({ baseDir, spawn?, isAlive? }): Promise<{ pid }>`; `stop.js`:
  `stopSuperteam({ baseDir, kill?, isAlive? }): Promise<{ stopped: boolean }>`.
  Each file also runs itself when executed with `node`, using the current folder
  as `baseDir`. The pid is in `.superteam/.r/superteam.pid`.

- [ ] **Step 1: Write the failing tests**

  `startSuperteam` refuses (throws) when `SUPERTEAM_PORT` is missing in
  `.superteam/.env`, and when the pid file holds a live pid; with a stale pid it
  starts; it spawns `node .../orchestrator/main.js` detached, with `cwd` the
  workspace and its output in `.superteam/.r/superteam.log`, and writes the pid
  file. `stopSuperteam` sends `SIGTERM` to the pid and returns
  `{ stopped: true }`; with no pid file it returns `{ stopped: false }`.

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test "superteam-engine/src/scripts/{start,stop}.test.js"`
  Expected: FAIL.

- [ ] **Step 3: Implement the scripts, and write the two skills**

  Each `SKILL.md` has a `name` (`start` or `stop`), a `description`, and tells
  Claude to run its script with
  `node ${CLAUDE_PLUGIN_ROOT}/src/scripts/<name>.js` in the workspace and to
  report the result.

- [ ] **Step 4: Run to verify they pass**

  Run: `node --test "superteam-engine/src/scripts/*.test.js" && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine && git commit -m "Add the Control Skill: start and stop the process of superteam"`

---

### Task 16: Seed Skill

Docs: `seed-skill.md`, `ADR 4`, `deployment.md` ("What a workspace must hold").

**Files:**

- Create: `superteam-engine/src/scripts/seed.js`, `seed.test.js`,
  `superteam-engine/skills/def-role/SKILL.md`,
  `superteam-engine/skills/def-process/SKILL.md`

**Interfaces:**

- Consumes: `validateWorkflow`, `isSlug`, `writeJson`, `workflowFile` (Task 2).
- Produces: `seed.js`: `ensureGitignore(baseDir): Promise<void>` (adds
  `.superteam/.r/` and `.superteam/.env` when a line is missing);
  `ensurePort(baseDir): Promise<number>` (writes `SUPERTEAM_PORT` with a free
  port in `.superteam/.env` when missing, keeps an existing value);
  `writeRole(baseDir, { name, description, tools, model, instructions }): Promise<string>`
  (writes `.claude/agents/{name}.md`, and always adds `StructuredOutput` to
  `tools`); `writeWorkflow(baseDir, workflow): Promise<string>` (refuses a
  workflow that `validateWorkflow` refuses).

- [ ] **Step 1: Write the failing tests**

  `ensureGitignore` run twice leaves one copy of each line and keeps the other
  lines; `ensurePort` keeps an existing `SUPERTEAM_PORT` and keeps the other
  variables of the file; `writeRole` with `tools: ["Read"]` writes a header
  whose `tools` is `Read, StructuredOutput`, and with no tools writes no `tools`
  line; it refuses a name that is not a slug. `writeWorkflow` refuses a cycle
  and writes `.superteam/.p/workflows/{name}.json` for a valid one. It writes no
  other file (the Seed Skill writes nothing else).

- [ ] **Step 2: Run to verify they fail**

  Run: `node --test superteam-engine/src/scripts/seed.test.js` Expected: FAIL.

- [ ] **Step 3: Implement `seed.js`, and write the two skills**

  `def-role/SKILL.md` and `def-process/SKILL.md` tell Claude to read the
  project, propose roles or workflows to the person, and write them only through
  `seed.js` (never by hand), then to run `ensureGitignore` and `ensurePort`. The
  AI chooses the content; the script owns every write.

- [ ] **Step 4: Run to verify they pass**

  Run: `node --test superteam-engine/src/scripts/seed.test.js && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**
      `git add superteam-engine && git commit -m "Add the Seed Skill that creates the config files"`

---

### Task 17: End-to-end test of a work

Docs: `action-flow.md`, `data-flow.md`, `use-cases.md` (UC2, UC3).

**Files:**

- Create: `superteam-engine/src/orchestrator/e2e.test.js`,
  `test/fixtures/fake-gh.js`
- Modify: `test/fixtures/fake-claude.js` (Task 9)

**Interfaces:**

- Produces: `fake-gh.js`: `createFakeGh({ baseDir }): run` for
  `createGitAdapter`: it forwards `git` to the real command, and keeps the pull
  requests of `gh` in memory (`create`, `view`, `merge --squash` as a squash
  merge of the branch into the root branch of `baseDir` with real git, `close`).
  `fake-claude.js` in mode `ok` reads `Branches to merge:` from the prompt,
  merges those branches, otherwise writes a file named after the role, commits,
  and prints a valid result.

- [ ] **Step 1: Write the failing test**

  In a temp repository with a bare `origin`, whose root branch has a committed
  `.gitignore` with `.superteam/.r/` and `.superteam/.env` (as the Seed Skill
  leaves it), a workflow `a`, `b`, `c` (`c` depends on `a` and `b`), and the
  whole stack started by `createOrchestrator` on port `0` with the fake `claude`
  and the fake `gh`: **Approve path:** `POST /works` gives `202` and an id;
  polling `GET /works/{id}` reaches `DONE` and `PROPOSED`;
  `POST /works/{id}/decision` with `approve` reaches `APPROVED`, the file
  `.superteam/.p/works/{id}.json` is in the root workspace and `GET /works`
  lists it, and no `works/{id}` or `tasks/{id}/*` branch is left on `origin`.
  **Reject path:** a second work is rejected: `REJECTED`, `works/{id}` kept on
  `origin`, task branches gone; `archive` removes the branch and the work is no
  longer listed. **Failure path:** with `FAKE_CLAUDE_MODE=fail` for step `b`,
  the work is `FAILED` with an `error`, the other job is stopped, the branch
  `works/{id}` is kept on `origin`, and `archive` removes it. **Restart:**
  stopping the orchestrator while a worker hangs and starting it again fails
  that work (`reconcile`). **Errors:** an unknown workflow is `404`, a repeated
  `id` is `409`, a decision on a work that is not `PROPOSED` is `409`.

- [ ] **Step 2: Run to verify it fails**

  Run: `node --test superteam-engine/src/orchestrator/e2e.test.js` Expected:
  FAIL.

- [ ] **Step 3: Implement the fixtures and fix whatever the test shows**

  Every defect that the test finds is fixed in the task that owns the code, with
  a test there first.

- [ ] **Step 4: Run to verify it passes**

  Run: `npm test && npm run lint` Expected: PASS, with every earlier test.

- [ ] **Step 5: Commit**
      `git add superteam-engine test && git commit -m "Add the end-to-end test of a work, from assign to approve, reject and fail"`

---

## Self-review (done when the plan was written)

- **Spec coverage:** requirements 1 to 13 of `introduction.md` map to: 1 and 6
  to Tasks 8, 12; 2 to Tasks 1, 4 to 6; 3 and 4 to Tasks 3, 7; 5 to Tasks 6, 7,
  17; 7 and 8 to Tasks 2, 3; 9 to Task 11; 10 to Task 16; 11 to Task 9 (timeout
  and budget); 12 to Tasks 12, 15; 13 to Task 7 and Task 17. UC1 is Task 16, UC2
  is Tasks 5 to 8 and 17, UC3 is Task 7.
- **Types:** `Job`, `jobId`, `parseJobId`, `artifactId`, `writeArtifacts`,
  `EngineError`, `WorkState`, `createSubscribers`, `createEngineHandlers` and
  `handleSignals` are defined once and used by the same names later.
- **Proportion:** the plan fixes names, signatures, values and tests, and leaves
  the bodies to the implementer.
