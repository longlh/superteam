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
    │   └── query-data/
    └── src/                        everything we write
        ├── schemas/                JSON Schema of the core entities
        ├── lib/                    shared library: paths, schema validation, store, locks, ids, events, write
        ├── engine/                 publish, validate the brain's output, apply
        ├── scripts/                CLI scripts called through Bash: write, register, cleanup, engine, install
        └── mcp/                    AI Enhancement: MCP server, brain
            └── index/              in-memory index table and file watcher
```

## Files

Planned files, none created yet. README section numbers in brackets.

### Plugin root (`superteam-engine/`)

| File | Responsibility |
| --- | --- |
| `.claude-plugin/plugin.json` | Plugin manifest (exists). |
| `.mcp.json` | Declares the MCP server (2.1). |
| `package.json` | Dependencies and scripts of the plugin. |
| `skills/def-role/SKILL.md` | Skill "Define role" (2.2). |
| `skills/def-process/SKILL.md` | Skill "Define process" (2.2). |
| `skills/query-data/SKILL.md` | Skill "Query data" (2.2). |

### `src/schemas/`

| File | Responsibility |
| --- | --- |
| `_task`, `_artifact`, `_role`, `_process`, `_subscription`, `_event`, `_rejection` `.schema.json` | One JSON Schema per core entity (exist). |

### `src/lib/`

| File | Responsibility |
| --- | --- |
| `paths.js` | Find the project root and the `.superteam/data` layout (1.1). |
| `schema.js` | Load the schemas, validate records, handle `x-type` and `x-ref`. |
| `store.js` | Read records by path pattern (1.2) and write them atomically. |
| `lock.js` | Write lock and engine lock. |
| `ids.js` | `auto_id` allocation under the write lock. |
| `events.js` | Enqueue and dequeue `_event` records, derive the topic. |
| `write.js` | The write pipeline: validate, store the `_event`, write the data file (1.3). |

### `src/engine/`

| File | Responsibility |
| --- | --- |
| `publish.js` | Pick the live subscriptions of a topic, order them, call the endpoint, retry. |
| `validate.js` | The six checks on the brain's output, and the `_rejection` record. |
| `apply.js` | Apply accepted process events through `lib/write.js`. |

### `src/scripts/`

| File | Responsibility |
| --- | --- |
| `write.js` | Create, update or delete a record (`--caused-by`, `--no-trigger`) (1.4). |
| `register.js` | Register or renew a `_subscription` (1.4). |
| `cleanup.js` | Delete the expired `_subscription` records (1.4). |
| `engine.js` | Drain the event queue and run `engine/`. |
| `install.js` | Installation (2.3). |

### `src/mcp/`

| File | Responsibility |
| --- | --- |
| `server.js` | MCP stdio server, local HTTP listener, registration and renewal (2.1). |
| `brain.js` | Spawn `claude -p`, read `structured_output` (2.1.2). |
| `index/table.js` | In-memory index table and its queries (2.1.1). |
| `index/watcher.js` | File watcher that drives the re-index (2.1.1). |

### `test/`

| Directory | Responsibility |
| --- | --- |
| `lib/`, `engine/`, `mcp/` | One test file per source file, mirroring `src/`. |
| `fixtures/` | Sample projects with `.superteam/data`. |

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

| # | Decision | Proposal |
| --- | --- | --- |
| 1 | Language | Plain JavaScript, ES modules, no build step. |
| 2 | Libraries | `ajv` (2020 draft, with `ajv-formats`) to validate the schemas, including the custom `x-` keywords. `@modelcontextprotocol/sdk` for the MCP server, from Phase 2. |
| 3 | Test runner | `node:test`, built into Node. |
| 4 | Engine to brain contract | `POST` to the `endpoint` with JSON `{ "event": <_event>, "depth": <number> }`. The answer is JSON `{ "processEvents": [<_event>, ...] }`. A non-2xx status, no answer in time, or a body that cannot be read is a failed call (1). |
| 5 | CLI of `scripts/write.js` | `write.js <entity> create\|update\|delete [--id N] [--data '<json>'] [--caused-by <value>] [--no-trigger]`. It prints the written record as JSON. Exit code 0 on success, 1 on a rejected write. |
| 6 | Depth limit | 5. |
| 7 | What `_process` holds beyond `trigger`, `output` and `assignTo` | The steps the process runs (which role does what). Needed before the installation (2.3) can generate `.claude/workflows/{process}.js`. Decide before Phase 3. |
| 8 | "The assignee fits `assignTo`" (check 4 in 1) | Checked only when the event sets `assignee`. An update that does not touch `assignee` passes. |

### Phase 0: how the brain runs (done)

The MCP server starts a Claude workflow by spawning a child `claude -p` (2.1.2). Two risks go to Phase 3: a child started in a project with this plugin may load the plugin and its MCP server again, and the usage counts against the account's limit in a way not yet measured.

### Phase 1: engine core, no AI

Goal: write a record through a script and have the engine publish the event to an endpoint, validate the answer and apply it. Tested against a fake brain, an HTTP server in `test/fixtures/` that returns a configured answer.

| # | Task | Files |
| --- | --- | --- |
| 1.1 | Scaffold: `package.json` (ES modules, `npm test` runs `node --test`), the `ajv` dependency. | `package.json` |
| 1.2 | Project root and data layout. | `lib/paths.js` |
| 1.3 | Load the schemas, validate records, handle `x-type` (`auto_id`, `auto_increment_int` with `x-scope`, `path`), apply `default` when a raw record is read. | `lib/schema.js` |
| 1.4 | Write lock and engine lock, with stale lock recovery. | `lib/lock.js` |
| 1.5 | `auto_id` under the write lock, reading the disk. `_event` id as the next position in the queue, starting over when the queue is drained. | `lib/ids.js` |
| 1.6 | Read by path pattern (get, list), atomic write (temporary file, then rename, pretty JSON). | `lib/store.js` |
| 1.7 | Enqueue and dequeue `_event`, derive the topic from `target.entity` and `operation`. | `lib/events.js` |
| 1.8 | The write pipeline: lock, validate, store the `_event` first, write the data file, release the lock, start the engine detached unless `--no-trigger` (1.3). | `lib/write.js` |
| 1.9 | The write CLI (decision 5). | `scripts/write.js` |
| 1.10 | Publish: take the live subscriptions of the topic, latest `expiresAt` first, call the endpoint (10 minute timeout, retry after 1, 2 and 4 seconds), move to the next subscription on failure, skip subscribers of the same name and version after a rejection. | `engine/publish.js` |
| 1.11 | The six checks, the expected processes computed before publishing, `ack` handling, the `_rejection` record. | `engine/validate.js` |
| 1.12 | Apply accepted events through `lib/write.js`, keep `causedBy` and `depth`, refuse beyond the depth limit. | `engine/apply.js` |
| 1.13 | Drain the queue under the engine lock, look at the queue again before exiting, support the manual re-run of what is left. | `scripts/engine.js` |
| 1.14 | Register and renew a `_subscription`, delete the expired ones. | `scripts/register.js`, `scripts/cleanup.js` |

Done when, with the fake brain:
- Creating a `_task` publishes `_task:create`, and the process events the brain returns are applied.
- A batch that breaks a check applies nothing and leaves a `_rejection` with the right `check`.
- A missing process is rejected as `process-missing`, and an `ack` event is accepted and not applied.
- A dead endpoint is retried and then the next subscription is tried. A rejected answer moves on only to a subscriber with a different name or version.
- The depth limit stops a loop.
- Two writers at the same time get different ids and no lost write.
- `npm test` passes.

### Phase 2: MCP server, read side

Goal: an MCP server that Claude Code starts with the session, that serves queries and registers itself.

| # | Task | Files |
| --- | --- | --- |
| 2.1 | Decide how the dependencies reach an installed plugin (`node_modules` is not in git). Try `${CLAUDE_PLUGIN_DATA}` first. | `package.json`, `.mcp.json` |
| 2.2 | The in-memory index table: load the data, build the indexes declared in the schemas, answer queries by key. | `mcp/index/table.js` |
| 2.3 | The file watcher: re-index one record on change, full rebuild on demand. | `mcp/index/watcher.js` |
| 2.4 | The MCP server: stdio, query tools, a reload tool, a local HTTP listener on a random port bound to `127.0.0.1`. | `mcp/server.js`, `.mcp.json` |
| 2.5 | Register the three topics at start, renew every 13 minutes (TTL 1 hour). | `mcp/server.js` |

Done when the server starts in a Claude Code session, its subscriptions appear in `.superteam/data/_subscription/` and are renewed, and the query tools answer from the index.

### Phase 3: AI integration

Goal: events reach Claude, workflows run, results come back.

| # | Task | Files |
| --- | --- | --- |
| 3.1 | The brain: answer the engine's call by spawning `claude -p` as verified in Phase 0, return `structured_output`. Guard against the child loading the plugin again. | `mcp/brain.js` |
| 3.2 | The installation: `_role` to `.claude/agents/{role}.md`, `_process` to `.claude/workflows/{process}.js`, the `.gitignore` lines (2.3). Needs decision 7. | `scripts/install.js` |
| 3.3 | The skills: Define role, Define process, Query data (2.2). | `skills/*/SKILL.md` |
| 3.4 | End to end: a real workflow answers a real `_task:create` event. | `test/fixtures/` |

Done when a task created through a skill produces process events written by the real brain, and a wrong answer leaves a `_rejection`.
