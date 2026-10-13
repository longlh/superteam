# Superteam

## Goal

Build a workflow engine for projects that use Claude Code, delivered as a Claude Code plugin (`superteam-engine`).

## Overview

Every project has its own way of working. Superteam lets a project describe that way (its team and its workflow) as data, and runs a team of Claude Code agents on it.

The design has two layers:

- **Engine:** the `superteam-engine` plugin. It is generic and installed into any project: storage rules, scripts, MCP server, skills.
- **Project:** the data of one project, stored in its own repo under `.superteam/data/`. It is what makes the workflow specific to that project.

## Data flow

Normal operation:

```
scripts ──write──> .superteam/data/*.json ──watcher──> index ──> MCP server ──query──> agents
   │
   └──trigger──> workflow engine ──write (via scripts)──> tasks
```

- **Write path:** only the scripts (5) write the JSON files (1). After a write, the script triggers the workflow engine (7), which may write more data through the same scripts.
- **Read path:** the index (2) is loaded from the files and served by the MCP server (3). Agents and skills (4) read through it. The index is a library used by the MCP server.
- The workflow engine only reacts to changes made through the scripts. Data changed outside them (manual edits, git pull) does not trigger it for now.

## Build flow

Run manually after the project data changes, separate from normal operation:

```
.superteam/data/*.json ──read──> build script ──> Claude Code files (agents, workflows)
```

The build script (6) reads the files directly, bypassing the index and the MCP server.

## Components

### 1. Storage

File-based. Layout:

```
.superteam/data/{entity}/{id}.json
```

Each record is one JSON file, stored pretty-formatted so text diffs stay readable.

### 2. In-memory index table

A JS script loads the JSON files into memory, builds indexes over them, and exposes queries for fast access by index.

### 3. MCP server

Wraps the in-memory index table and gives AI agents a protocol to query project data. It is read-only: it never writes to `.superteam/data/` (writes go through the scripts, see 5). Its tools return both lists (by index) and full records (e.g. `get(entity, id)`), so agents need no other way to read.

- **Lifecycle:** a long-running process. Claude Code starts it (stdio) when a session starts and stops it when the session ends. It loads all JSON files once at startup and keeps the index in memory, so queries do not re-read files.
- **Sync:**
  - The JSON files are the source of truth; the index is only a cache.
  - A file watcher is the main sync mechanism: it reloads records changed on disk (written by scripts, manual edits, git pull, other sessions). There is a short delay between a write and the index seeing it.
- **Multiple instances:** several sessions on one project each run their own server with their own index. This is safe because servers only read; the write lock lives in the scripts.

### 4. Skills

Skills provided by the plugin:

- **Seed data:** create the initial data (e.g. roles, workflow definitions) through the scripts.
- **Query data:** query project data through the MCP server.

### 5. Scripts

Scripts are the only way to write `.superteam/data/`. Principle: use as much code as possible and leave as little as possible to the AI, so file handling is deterministic.

They share one library that handles:

- **Validation:** check the record against the entity schema.
- **`auto_id` allocation:** done under the write lock, reading the latest state from disk (not from an index).
- **Write lock:** every write takes it, so only one writer at a time across all instances.
- **Atomic write:** write a temp file, then rename, pretty-formatted JSON.
- **Trigger (outbox):** in the same lock as the data write, store an event file in `.superteam/events/`. The event carries the entity, id, operation, the changed fields (old and new values) and `causedBy`. After releasing the lock, start the workflow engine (7) detached, so the write script is never blocked. Seeding skips this step (`--no-trigger`).

Agents call the scripts through Bash.

### 6. Build script

A script that builds the Claude Code files, following Claude's conventions, from the data (e.g. Role -> agent, WorkflowDef -> workflow). It is a build step, run manually after the project data changes.

It reads the JSON files directly, following the storage layout from 1 (no index, no MCP server), and writes its output outside `.superteam/data/`, so it needs no write lock.

### 7. Workflow engine

Also a script. The engine is not a watcher or a background process: it only runs when a write script (5) triggers it after changing data. The trigger events are defined later. Data changed outside the scripts (manual edits, git pull) is not supported for now: it does not trigger the engine. On each trigger it looks up the matching WorkflowDef, runs a WorkflowExec, and automatically creates or updates tasks.

A WorkflowExec runs as a Claude Code workflow (the Workflow tool: a JavaScript script that orchestrates agents with `agent()`, `parallel()`, `pipeline()`), following Claude's own workflow convention. These workflow files are generated from the WorkflowDefs by the build script (6), and the agents they call are the ones generated from the Roles.

Its changes to the data go through the same write scripts, so they use the same validation and write lock.

How it consumes events:

- It drains `.superteam/events/` in order. It has its own lock (separate from the write lock), so only one engine processes events at a time.
- A processed event is removed (or marked done). An event is never lost: if the engine dies midway, a manual command re-runs the remaining events. This is a manual recovery step, not a watcher.
- When the engine writes data it passes `causedBy` (the WorkflowExec id) and a depth, and refuses to go past a depth limit, so it cannot loop forever.
