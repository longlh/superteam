# Plan

## Directory structure

```
superteam/                          repo root
├── CLAUDE.md
├── README.md
├── start-claude.sh
├── docs/
│   └── PLAN.md
├── test/                           tests, not shipped with the plugin
│   ├── lib/
│   ├── engine/
│   ├── mcp/
│   └── fixtures/                   sample projects
└── superteam-engine/               the plugin root (plugin name: `superteam`)
    ├── .claude-plugin/
    │   └── plugin.json
    ├── skills/                     skills must sit at the plugin root
    │   ├── def-role/
    │   ├── def-process/
    │   ├── finish/
    │   └── query-data/
    └── src/                        everything we write
        ├── schemas/                JSON Schema of the core entities
        ├── lib/                    shared library: paths, schema validation, store, locks, ids, events, write
        ├── engine/                 call the brain, validate its output, apply, deliver to the addons
        ├── addons/                 addons that extend the engine through pub/sub (googlechat)
        ├── scripts/                CLI scripts called through Bash: write, register, cleanup, engine, install
        └── mcp/                    AI Enhancement: MCP server, brain
            └── index/              in-memory index table and file watcher
```

## Files

Planned files, none created yet. README section numbers in brackets.

### Plugin root (`superteam-engine/`)

| File                          | Responsibility                          |
| ----------------------------- | --------------------------------------- |
| `.claude-plugin/plugin.json`  | Plugin manifest (exists).               |
| `.mcp.json`                   | Declares the MCP server (2.1).          |
| `package.json`                | Dependencies and scripts of the plugin. |
| `skills/def-role/SKILL.md`    | Skill "Define role" (2.2).              |
| `skills/def-process/SKILL.md` | Skill "Define process" (2.2).           |
| `skills/query-data/SKILL.md`  | Skill "Query data" (2.2).               |
| `skills/finish/SKILL.md`      | Skill "Finish" (2.2).                   |

### `src/schemas/`

| File                                                                                                                 | Responsibility                           |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `_work`, `_task`, `_artifact`, `_role`, `_process`, `_brain`, `_subscription`, `_event`, `_rejection` `.schema.json` | One JSON Schema per core entity (exist). |

### `src/lib/`

| File        | Responsibility                                                               |
| ----------- | ---------------------------------------------------------------------------- |
| `paths.js`  | Find the project root and the `.superteam/data` layout (1.1).                |
| `schema.js` | Load the schemas, validate records, handle `x-type` and `x-ref`.             |
| `store.js`  | Read records by path pattern (1.2) and write them atomically.                |
| `lock.js`   | Write lock.                                                                  |
| `ids.js`    | `auto_id` allocation under the write lock.                                   |
| `events.js` | Enqueue and dequeue `_event` records, derive the topic.                      |
| `write.js`  | The write pipeline: validate, store the `_event`, write the data file (1.3). |

### `src/engine/`

| File             | Responsibility                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrate.js` | The process in code (1.5, 1.6): create the tasks of a work, start them, finish the work, assign the approval.                                     |
| `addons.js`      | Deliver an event to every `_subscription` of its topic, before the brain is called: load the addon, give it 10 seconds, skip it on failure (1.7). |
| `call.js`        | Pick the live `_brain` records of a topic, order them, call the endpoint, retry.                                                                  |
| `validate.js`    | The four checks on the brain's output, and the `_rejection` record.                                                                               |
| `apply.js`       | Apply accepted process events through `lib/write.js`.                                                                                             |

### `src/scripts/`

| File          | Responsibility                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `write.js`    | Create, update or delete a record (`--no-trigger`) (1.4).                                             |
| `register.js` | Register or renew a `_brain` (1.4).                                                                   |
| `cleanup.js`  | Delete the expired `_brain` records (1.4).                                                            |
| `engine.js`   | Claim events one at a time and run `engine/` on each.                                                 |
| `finish.js`   | A human finishes a task or decides on a work: `finish task`, `finish work`, with `--as <role>` (1.4). |
| `install.js`  | Installation (2.3).                                                                                   |

### `src/addons/`

| File            | Responsibility                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `googlechat.js` | Addon: post to the webhook of a Google Chat space (URL from the environment variable named in `env`) when a task starts for a human (1.7). |

### `src/mcp/`

| File               | Responsibility                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`        | MCP stdio server: a follower forwards its queries to the leader, the leader runs the local HTTP listener, registration and renewal (2.1).                                                             |
| `leader.js`        | Leader election: the leader file `.superteam/pid`, the check every 3 seconds, the healthcheck that returns the secret, follower-only mode with `SUPERTEAM__MEMBER_ONLY` (2.1).                        |
| `brain.js`         | Spawn `claude -p`, read `structured_output` (2.1.2).                                                                                                                                                  |
| `recovery.js`      | When a server becomes the leader, and every 13 minutes after: find the abandoned tasks and works (no event in the queue, no live claim, no live agent) and touch them through the write script (2.1). |
| `index/table.js`   | In-memory index table and its queries (2.1.1).                                                                                                                                                        |
| `index/watcher.js` | File watcher that drives the re-index (2.1.1).                                                                                                                                                        |

### `test/`

| Directory                 | Responsibility                                   |
| ------------------------- | ------------------------------------------------ |
| `lib/`, `engine/`, `mcp/` | One test file per source file, mirroring `src/`. |
| `fixtures/`               | Sample projects with `.superteam/data`.          |

## Rules

- The plugin root holds only what Claude Code requires there: `.claude-plugin/`, `skills/`, and later `.mcp.json` and `package.json`. Everything else we write goes in `src/`.
- `lib/` imports nothing else in the plugin.
- `engine/` and `scripts/` import only `lib/` and `engine/`. They never import `mcp/`, so the engine stays free of AI.
- `mcp/` imports `lib/`, not `engine/`.
- Tests live in `test/` at the repo root, outside the plugin, so they are not shipped.

## Implementation plan

Phases are ordered by dependency. Phase 1 needs no AI and can be built and tested alone, against a fake brain. README section numbers in brackets.

### Decisions to confirm

These are proposals. The plan below assumes them, and each one is cheap to change before Phase 1 starts.

| #   | Decision                      | Proposal                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Language                      | Plain JavaScript, ES modules, no build step.                                                                                                                                                                                                                                                                                         |
| 2   | Libraries                     | `ajv` (2020 draft, with `ajv-formats`) to validate the schemas, including the custom `x-` keywords. `@modelcontextprotocol/sdk` for the MCP server, from Phase 2.                                                                                                                                                                    |
| 3   | Test runner                   | `node:test`, built into Node.                                                                                                                                                                                                                                                                                                        |
| 4   | Engine to brain contract      | `POST` to the `endpoint` with JSON `{ "event": <_event>, "depth": <number> }`. The answer is JSON `{ "processEvents": [<_event>, ...] }`. The brain may send the header `X-Agent-Pid` as soon as it has started an agent, before the body. A non-2xx status, no headers in time, or a body that cannot be read is a failed call (1). |
| 5   | CLI of `scripts/write.js`     | `write.js <entity> create\|update\|delete [--id N] [--data '<json>'] [--no-trigger]`. It prints the written record as JSON. Exit code 0 on success, 1 on a rejected write.                                                                                                                                                           |
| 6   | Depth limit                   | 5.                                                                                                                                                                                                                                                                                                                                   |
| 7   | Where the process logic lives | In the engine, as code (`engine/orchestrate.js`), run on each event before it is sent to the brain. Not a separate brain.                                                                                                                                                                                                            |
| 8   | Status of a work              | Stored, set by the engine from its tasks. Its progress is computed when read.                                                                                                                                                                                                                                                        |

### Phase 0: how the brain runs (done)

The MCP server starts Claude by spawning a child `claude -p` (2.1.2). Checked so far: the child signs in with the user's account and returns a validated `structured_output`. Three things go to Phase 3 because they are not checked yet: running the agent of a role with `--agent`, a child started in a project with this plugin loading the plugin and its MCP server again, and how the usage counts against the account's limit.

### Phase 1: engine core, no AI

Goal: write a record through a script and have the engine run the process, send the event to the endpoint of the brain, validate the answer and apply it. Tested against a fake brain, an HTTP server in `test/fixtures/` that returns a configured answer.

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Files                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1.1  | Scaffold: `package.json` (ES modules, `npm test` runs `node --test`), the `ajv` dependency.                                                                                                                                                                                                                                                                                                                                                                                | `package.json`                              |
| 1.2  | Project root and data layout.                                                                                                                                                                                                                                                                                                                                                                                                                                              | `lib/paths.js`                              |
| 1.3  | Load the schemas, validate records, handle `x-type` (`auto_id`, `auto_increment_int` with `x-scope`, `path`), apply `default` when a raw record is read.                                                                                                                                                                                                                                                                                                                   | `lib/schema.js`                             |
| 1.4  | Write lock, with stale lock recovery.                                                                                                                                                                                                                                                                                                                                                                                                                                      | `lib/lock.js`                               |
| 1.5  | `auto_id` under the write lock, reading the disk. `_event` id as the next position in the queue, starting over when the queue is drained.                                                                                                                                                                                                                                                                                                                                  | `lib/ids.js`                                |
| 1.6  | Read by path pattern (get, list), atomic write (temporary file, then rename, pretty JSON).                                                                                                                                                                                                                                                                                                                                                                                 | `lib/store.js`                              |
| 1.7  | Enqueue and dequeue `_event`, derive the topic from `target.entity` and `operation`.                                                                                                                                                                                                                                                                                                                                                                                       | `lib/events.js`                             |
| 1.8  | The write pipeline: lock, validate, write the new content to a temp file in `.superteam/tmp/` and hash it, store the `_event` (with both hashes and the temp path), move the temp file onto the data file, release the lock, start the engine detached unless `--no-trigger` (1.3).                                                                                                                                                                                        | `lib/write.js`                              |
| 1.9  | The write CLI (decision 5).                                                                                                                                                                                                                                                                                                                                                                                                                                                | `scripts/write.js`                          |
| 1.9b | The finish CLI: check the role (human, assigned or in `canApprovedBy`) and the state, create the artifact, then write the status or the decision, all through `lib/write.js` (1.4).                                                                                                                                                                                                                                                                                        | `scripts/finish.js`                         |
| 1.10 | Orchestrate: create the tasks of a work from the `_process` named by its `type` (with `customInstructions`), start the tasks whose `dependOn` are `DONE`, set the work `IN_PROGRESS` and `DONE`, assign the approval to the first bot role of `canApprovedBy` (1.5, 1.6).                                                                                                                                                                                                  | `engine/orchestrate.js`                     |
| 1.11 | Call the brain: take the live `_brain` records of the topic, latest `expiresAt` first, call the endpoint (headers within 1 minute, record `X-Agent-Pid` in the claim, wait for the body while the agent is alive, a configurable maximum for a hung agent, 10 minutes when there is no pid; retry after 1, 2 and 4 seconds, never while the agent is alive), move to the next brain on failure, skip brains of the same implementation name and version after a rejection. | `engine/call.js`                            |
| 1.12 | The four checks (`schema`, `scope`, `approver`, `depth`) and the `_rejection` record.                                                                                                                                                                                                                                                                                                                                                                                      | `engine/validate.js`                        |
| 1.13 | Apply accepted events through `lib/write.js`, keep `depth`, refuse beyond the depth limit.                                                                                                                                                                                                                                                                                                                                                                                 | `engine/apply.js`                           |
| 1.14 | Claim an event by moving it to `.superteam/claims/{pid}/` (one atomic rename), process it, and go on until none is left to claim. Before processing it, check that its write completed (the hashes and the temp path of the event, without a lock) and drop an event whose write never completed. A manual command releases the claims of dead processes and re-runs what is left.                                                                                         | `scripts/engine.js`, `lib/events.js`        |
| 1.15 | Register and renew a `_brain`, delete the expired ones.                                                                                                                                                                                                                                                                                                                                                                                                                    | `scripts/register.js`, `scripts/cleanup.js` |
| 1.16 | Addons: deliver each event to the addons of its topic before the brain is called, with a 10 second limit, skip an addon that fails. The first addon, `googlechat`.                                                                                                                                                                                                                                                                                                         | `engine/addons.js`, `addons/googlechat.js`  |

Done when, with the fake brain:

- Creating a work creates its tasks from its process. Tasks that do not depend on each other start together, and a task that depends on others starts only when they are `DONE`.
- When every task is `DONE` the work is `DONE`, and the approval is assigned to the first bot role of `canApprovedBy`, or left to a human when there is none.
- The process events the fake brain returns are applied.
- A batch that breaks a check (`schema`, `scope`, `approver`, `depth`) applies nothing and leaves a `_rejection` with the right `check`.
- A dead endpoint is retried and then the next brain is tried. A rejected answer moves on only to a brain with a different implementation name or version.
- The depth limit stops a loop.
- Two writers at the same time get different ids and no lost write.
- Two engine processes never claim the same event, and two tasks that do not depend on each other wait for the brain at the same time.
- Two tasks that finish at the same time set the work `DONE` once.
- Every `_subscription` of a topic receives the event, an addon that fails or is too slow is skipped, and the brain is still called.
- An endpoint that sends `X-Agent-Pid` is waited for as long as the agent is alive, with no 10 minute limit, and it is not called again while that agent is alive.
- An event whose write completed late is processed after it completes, and an event whose write never completed (the writer died) is dropped.
- `npm test` passes.

### Phase 2: MCP server, read side

Goal: an MCP server that Claude Code starts with the session, that serves queries and registers itself.

| #   | Task                                                                                                                                                                                                                                                   | Files                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 2.1 | Decide how the dependencies reach an installed plugin (`node_modules` is not in git). Try `${CLAUDE_PLUGIN_DATA}` first.                                                                                                                               | `package.json`, `.mcp.json`  |
| 2.2 | The in-memory index table: load the data, build the indexes declared in the schemas, answer queries by key.                                                                                                                                            | `mcp/index/table.js`         |
| 2.3 | The file watcher: re-index one record on change, full rebuild on demand.                                                                                                                                                                               | `mcp/index/watcher.js`       |
| 2.4 | The MCP server: stdio, query tools, a reload tool, a local HTTP listener on a random port bound to `127.0.0.1`.                                                                                                                                        | `mcp/server.js`, `.mcp.json` |
| 2.5 | The leader registers the topics `_task:update` and `_work:update` when it becomes leader, and renews them every 13 minutes (TTL 1 hour).                                                                                                               | `mcp/server.js`              |
| 2.6 | Leader election: claim `.superteam/pid` with an exclusive create, check the pid and then the healthcheck (the secret in `.superteam/secret`) every 3 seconds, take over when the leader is gone, never volunteer when `SUPERTEAM__MEMBER_ONLY` is set. | `mcp/leader.js`              |
| 2.7 | Recovery: once the new leader has registered, and then every 13 minutes, scan for abandoned work (read the queue first, then the claims) and touch it once (`recoveries`).                                                                             | `mcp/recovery.js`            |

Done when the server starts in a Claude Code session, its `_brain` records appear in `.superteam/data/_brain/` and are renewed, and the query tools answer from the index. With two sessions on one project only one is the leader and registers; when the leader stops, the other takes over within a few seconds.

### Phase 3: AI integration

Goal: events reach Claude, agents do the tasks and the approvals, results come back.

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Files                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 3.1 | The brain: answer the engine's call only for a task in progress or an approval given to a bot role, build the prompt, spawn `claude -p` with the agent of the role, return `structured_output`. Check `--agent`. Set `SUPERTEAM__MEMBER_ONLY` in the child, so the MCP server it starts stays a follower. Run the child as a process group of its own, send the headers with `X-Agent-Pid` as soon as it is spawned, and the body when it has finished. | `mcp/brain.js`       |
| 3.2 | The installation: `_role` to `.claude/agents/{role}.md`, the `.gitignore` lines (`_event`, `_brain`, `.superteam/pid`, `.superteam/secret`, `.superteam/claims/`, `.superteam/tmp/`), and `.superteam/secret` when it is missing (2.3).                                                                                                                                                                                                                 | `scripts/install.js` |
| 3.3 | The skills: Define role, Define process, Query data, Finish (2.2).                                                                                                                                                                                                                                                                                                                                                                                      | `skills/*/SKILL.md`  |
| 3.4 | End to end: a research process with `WORK` and `REVIEW` steps. A work is created, agents do its tasks, and the approval goes to a human or to an agent.                                                                                                                                                                                                                                                                                                 | `test/fixtures/`     |

Done when a work of the research type ends `DONE` with the artifacts written by real agents, and an agent that goes beyond its task leaves a `_rejection`.
