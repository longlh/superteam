# Superteam

## Goal

Build a workflow engine for projects that use Claude Code, delivered as a Claude Code plugin (`superteam-engine`).

## Overview

Every project has its own way of working. Superteam lets a project describe that way (its team and its workflow) as data, and runs a team of Claude Code agents on it.

The design has two layers:

- **Engine:** the `superteam-engine` plugin. It is generic and installed into any project: storage rules, write scripts, skills, and an optional MCP server that enhances reading.
- **Project:** the data of one project, stored in its own repo under `.superteam/data/`. It is what makes the workflow specific to that project.

## Data flow

Normal operation follows CQRS: writes (commands) and reads (queries) are separate paths, both provided by the engine.

- **Write flow:** see 1.3. Scripts write the data files, then trigger the workflow engine.
- **Read flow:** see 1.2. Records are read directly from the data files. The optional MCP server (2.1) enhances it with an in-memory index.

## Build flow

Run manually after the project data changes, separate from normal operation:

```
.superteam/data/*.json ──read──> build script ──> Claude Code files (agents, workflows)
```

The build script (2.3) reads the files directly, bypassing the index and the MCP server.

## Components

### 1. Workflow engine

The foundation of the plugin. It defines the core entities and runs the workflows on them. It is self-contained: it writes through its scripts (1.4) and reads the data files directly (1.2).

Core entities are defined by the engine and have a `_` prefix. Their schemas are JSON Schema files in `superteam-engine/schemas/`, named `<entity>.schema.json`. Entities without the prefix belong to the project.

| Entity | Description |
| --- | --- |
| `_task` | A unit of work: type, status, assignee, parent and dependencies. |
| `_artifact` | A file produced for a task, versioned per task. |
| `_role` | A team member of the project, either `bot` or `human`; the build script turns it into an agent. |
| `_workflow` | A named definition that triggers and assigns tasks automatically, made of entries; the build script turns it into a Claude Code workflow. |
| `_workflow-exec` | A record of one execution of a `_workflow` entry: what triggered it, which tasks it created, and the result. |
| `_event` | An outbox record written with each data write, which triggers the engine. |

The engine is a script. It is not a watcher or a background process: it only runs when a write script (1.4) triggers it after changing data. The trigger events are defined later. Data changed outside the scripts (manual edits, git pull) is not supported for now: it does not trigger the engine. On each trigger it looks up the matching `_workflow`, runs a `_workflow-exec`, and automatically creates or updates tasks.

A `_workflow-exec` runs as a Claude Code workflow (the Workflow tool: a JavaScript script that orchestrates agents with `agent()`, `parallel()`, `pipeline()`), following Claude's own workflow convention. These workflow files are generated from the `_workflow` records by the build script (2.3), and the agents they call are the ones generated from the `_role` records.

Its changes to the data go through the same write scripts, so they use the same validation and write lock.

How it consumes events:

- It drains `.superteam/data/_event/` in order. It has its own lock (separate from the write lock), so only one engine processes events at a time.
- A processed event is removed (or marked done). An event is never lost: if the engine dies midway, a manual command re-runs the remaining events. This is a manual recovery step, not a watcher.
- When the engine writes data it passes `causedBy` (the `_workflow-exec` id) and a depth, and refuses to go past a depth limit, so it cannot loop forever.

#### 1.1. Storage

File-based. Layout:

```
.superteam/data/{entity}/{id}.json
```

Each record is one JSON file, stored pretty-formatted so text diffs stay readable.

Core entities (`_` prefix) follow the same layout, e.g. `.superteam/data/_task/1.json`.

#### 1.2. Read

Records are read directly from the data files by path pattern:

| Query | Path pattern |
| --- | --- |
| get one record | `.superteam/data/{entity}/{id}.json` |
| list the records of an entity | `.superteam/data/{entity}/*.json` |

- Reads need no script: the data files are read natively.
- Reads go to disk, so they always see the latest write. They need no index and no running process.
#### 1.3. Write

```
write script ──lock──> validate ──> event (.superteam/data/_event/, gitignored)
                              │
                              └──> data file (.superteam/data/{entity}/{id}.json)
                  release lock ──trigger──> workflow engine ──write (via scripts)──> tasks
```

- Only the write scripts (1.4) write the data files (1.1).
- Inside one lock, the script validates the record against the entity schema, stores the `_event` first, then writes the data file. The event is an outbox for the trigger, not the source of truth: the JSON files are.
- After releasing the lock, the script triggers the workflow engine detached. The engine may write more data through the same scripts.
- The engine runs the `_workflow-exec` with Claude's Workflow tool, which only works inside a Claude session. Assumption, not yet verified: the engine spawns `claude -p` headless to run the saved workflow by name. Revisit when the engine is built.
- The engine only reacts to changes made through the scripts. Data changed outside them (manual edits, git pull) does not trigger it for now.

#### 1.4. Scripts

Scripts are the only way to write `.superteam/data/`.

They share one library that handles:

- **Validation:** check the record against the entity schema.
- **`auto_id` allocation:** done under the write lock, reading the latest state from disk (not from an index).
- **Write lock:** every write takes it, so only one writer at a time across all instances.
- **Atomic write:** write a temp file, then rename, pretty-formatted JSON.
- **Trigger (outbox):** in the same lock as the data write, store an `_event` record in `.superteam/data/_event/`. The event carries the `target` (entity and id), the `operation`, the changed fields (old and new values), `causedBy` and `depth` (see `_event.schema.json`). After releasing the lock, start the workflow engine (1) detached, so the write script is never blocked. Seeding skips this step (`--no-trigger`).

### 2. AI Enhancement

The layer that lets AI agents use the engine: an optional index and MCP server for reading, and skills that call the engine's scripts. The engine (1) does not depend on it.

#### 2.1. MCP server

An optional enhancement of the read side. On top of the in-memory index table (2.1.1), the server gives AI agents a protocol to query project data. It is read-only: it never writes to `.superteam/data/` (writes go through the scripts, see 1.4). Its tools query by those keys, such as the tasks of an assignee, the children of a task or the tasks with a given status. Query by id is not served by it: a record by id is always read directly from its data file (1.2).

- **Lifecycle:** a long-running process. Claude Code starts it (stdio) when a session starts and stops it when the session ends. It loads all JSON files once at startup and keeps the index in memory, so queries do not re-read files.
- **Multiple instances:** several sessions on one project each run their own server with their own index. This is safe because servers only read; the write lock lives in the scripts.

##### 2.1.1. In-memory index table

A JS script loads the JSON files into memory, builds indexes, and exposes queries for fast access by key. It owns the file watcher, which drives the re-index on change events.

What is indexed:

| Item | Rule |
| --- | --- |
| Indexed keys | Keys other than id, declared in the entity schemas. Typically foreign keys (fields that reference another entity). |
| Not indexed | `id`: a record by id is read directly from its data file (1.2). |
| Current set | None declared yet. Keys are added to the schemas as real query needs appear. |

When it re-indexes:

| Trigger | Scope | Notes |
| --- | --- | --- |
| Bootstrap | All records, all indexes | When the MCP server starts. |
| Change event | The changed record only: its entries are added, replaced or removed | When the file watcher sees a data file created, changed or deleted, whoever made the change (scripts, manual edits, git pull, other sessions). |
| Manual | All records, rebuilt from scratch | On demand through a reload tool of the server. Recovery when the watcher missed an event. |

A change to the declared keys in a schema takes effect at the next bootstrap or manual rebuild.

#### 2.2. Skills

Skills provided by the plugin:

| Skill | Syntax | Description |
| --- | --- | --- |
| Define role | `/superteam:def-role` | Use AI to create `_role` records, written through the scripts (1.4). |
| Define workflow | `/superteam:def-workflow` | Use AI to create `_workflow` records, written through the scripts (1.4). |
| Query data | `/superteam:query-data <entity> [id]` | Query project data. A record by id is always read directly from its data file (1.2). Other queries go through the MCP server (2.1) when it is available, otherwise by listing the data files (1.2). |

#### 2.3. Installation

Installs the project into Claude Code: a script transforms core entities into Claude Code files, following Claude's conventions. It is run manually after the project data changes.

| Entity | Claude Code file | Notes |
| --- | --- | --- |
| `_role` | `.claude/agents/{role}.md` | the role record (`description`, `tools`, `model`) combined with its `instructions` file |
| `_workflow` | `.claude/workflows/{workflow}.js` | generated from its entries, run by the engine by name |

The script reads the JSON files directly, following the storage layout from 1.1 (no index, no MCP server), and writes its output outside `.superteam/data/`, so it needs no write lock.

