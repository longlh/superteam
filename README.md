# Superteam

## Goal

Build a workflow engine for projects that use Claude Code, delivered as a Claude Code plugin (`superteam`).

## Overview

Every project has its own way of working. Superteam lets a project describe that way (its team and its workflow) as data, and runs a team of Claude Code agents on it.

The design has two layers:

- **Engine:** the `superteam` plugin. It is generic and installed into any project. It is a headless engine framework: it stores data, queues events, publishes them to an external API that is its brain, and applies the result. In the real integration the brain is Claude (the AI layer, 2).
- **Project:** the data of one project, stored in its own repo under `.superteam/data/`. It is what makes the workflow specific to that project.

## Data flow

Normal operation follows CQRS: writes (commands) and reads (queries) are separate paths, both provided by the engine.

- **Write flow:** see 1.3. Scripts write the data files, then trigger the engine.
- **Read flow:** see 1.2. Records are read directly from the data files. The optional MCP server (2.1) enhances it with an in-memory index.

## Installation flow

Run manually after the project data changes, separate from normal operation:

```
.superteam/data/*.json ──read──> installation script ──> Claude Code files (agents, workflows), .gitignore
```

The installation script (2.3) reads the files directly, bypassing the index and the MCP server.

## Components

### 1. Engine

The foundation of the plugin: a headless engine framework. It defines the core entities, stores and serves their data, and publishes events to an external API that acts as its brain. It has no workflow logic of its own. In the real integration the brain is Claude (2.1.2). It is self-contained: it writes through its scripts (1.4) and reads the data files directly (1.2).

Core entities are defined by the engine and have a `_` prefix. Their schemas are JSON Schema files in `superteam-engine/schemas/`, named `<entity>.schema.json`. Entities without the prefix belong to the project.

| Entity | Description |
| --- | --- |
| `_task` | A unit of work: type, status, assignee, parent and dependencies. |
| `_artifact` | A file produced for a task, versioned per task. |
| `_role` | A team member of the project, either `bot` or `human`. |
| `_workflow` | A named definition of a workflow, made of entries. The engine uses it to enforce what the endpoint may return; the installation (2.3) generates Claude Code files from it. |
| `_rejection` | A record of a batch of workflow events the engine rejected: the subscription that was called, the published event, what the brain returned, and which checks it broke. A business error, recorded so the workflow or the brain can be fixed; versioned in git. |
| `_subscription` | A subscription to events, for pub/sub: which topic (`topic`, as `{entity}:{operation}`, such as `_task:create`) is published to which `endpoint` (an address), and who subscribed (`subscriber`: name and version). It has a TTL (`expiresAt`): its creator renews it while it is alive, and one that is not renewed expires and is ignored. Created by an external system; the engine only reads it to publish. |
| `_event` | An outbox record written with each data write, which triggers the engine. The `_event` folder is a queue: the write scripts enqueue events in id order, and the engine dequeues (removes) each one once processed. The event id is only the order in the queue, not a unique identity: it can start over once the queue is drained. Immutable: once written it is never modified. |

The engine is a script. It is not a watcher or a background process: it only runs when a write script (1.4) triggers it after changing data. Data changed outside the scripts (manual edits, git pull) is not supported for now: it does not trigger the engine. On each trigger it reads the events in the queue, finds the `_subscription` records that have not expired and whose `topic` is the topic of each one, and calls their `endpoint` one at a time, the one with the latest `expiresAt` first, until the response of one is accepted. The engine relies only on this data.

The endpoint is the engine's brain. After a write, the engine sends it the published event (with its `target`) and expects a list of **workflow events** back: `_event` records, each describing a write the engine must make, such as creating or updating a task. A workflow event is a derived type of `_event`, not a separate entity, so it has the same shape. Its `causedBy` is the `_workflow` the brain ran. Events are immutable (read-only): the engine applies them as they are, or rejects them. If any workflow event is rejected, the engine applies none of them, does not retry, and records the rejection as a `_rejection`. This is a business error (the brain broke the workflow), unlike a failed call, which is a system error and is not recorded. Accepted events are applied through the write scripts (1.4), so they use the same validation and write lock.

What the engine publishes and subscribes to:

| Item | What |
| --- | --- |
| Published | The `_event` record, unchanged. Nothing else is published: not the data records, not the `_workflow`. |
| Subscribed to | Changes of an entity, by topic `{entity}:{operation}`: `_task:create`, `_task:update`, `_task:delete`, and so on. A `_subscription` names the topic; the topic of an `_event` is its `target.entity` and its `operation`. |
| Delivered to | The `endpoint` of one subscription. The live subscriptions of the topic are called one at a time, the one with the latest `expiresAt` first, and the first whose response the engine accepts wins: the others are not called. |
| Sent along | The `depth` the returned events must carry: the depth of the published event plus one. |
| Returned | A list of workflow events (`_event` records), each with `causedBy` (the `_workflow` the brain ran) and `depth`. They are not published: the engine validates and applies them, and the writes enqueue new `_event` records. |

The engine validates the returned list in code, using the published event (its `target` and `operation`) and the `causedBy` of each returned event:

1. Every returned event is a valid `_event` and writes valid data (entity schemas).
2. `causedBy` is an existing `_workflow`.
3. The change really triggers that workflow: it has an entry whose `trigger` is the topic of the published event.
4. That workflow may return the event: the topic of the returned event and the fields it changes fit the `output` of that entry, and the assignee fits `assignTo`.
5. `depth` is the depth of the published event plus one, and does not pass the depth limit.
6. No workflow is missing. Before it publishes, the engine works out which workflows the event triggers: the ones with an entry whose `trigger` is the topic of the event. Each of them must appear as `causedBy` in at least one returned event. A workflow that has nothing to change still returns an `ack` event: its `operation` is `ack`, its `target` is the target of the published event, and it has no `changes`. An `ack` event is never listed in `output` and is always allowed. It is checked like the others but not applied: nothing is written.

A `_rejection` lists each violation: which of these checks was broken, and by which returned event (or by the batch as a whole, for a missing workflow) (`schema`, `workflow-unknown`, `trigger-mismatch`, `output-not-allowed`, `depth`, `workflow-missing`).

This validation is for the brain only. Events written through the scripts (by a skill or manually) are checked against the entity schemas, and their `causedBy` (a skill name or null) is not checked against a `_workflow`.

How it consumes events:

- It drains `.superteam/data/_event/` in order. It has its own lock (separate from the write lock), so only one engine processes events at a time.
- A processed event is marked done by removing it; events are never modified. An event is never lost: if the engine dies midway, a manual command re-runs the remaining events. This is a manual recovery step, not a watcher.
- When the engine calls an endpoint it passes the `depth` the returned events must carry (the depth of the published event plus one). It refuses to go past a depth limit, so it cannot loop forever.
- Every attempt to call an endpoint times out after 10 minutes. If a call fails for any reason (the endpoint cannot be reached, it times out, or its response cannot be read), the engine treats all failures the same way: it retries 3 times, after 1, 2 and 4 seconds. If it still fails, the engine goes on to the next subscription of the topic. A response that can be read but that the engine rejects is recorded as a `_rejection` and is not a call failure; the engine goes on to the next subscription whose subscriber (name and version) is different, because the same version would make the same mistake. When no subscription is left, the engine gives up silently: nothing is recorded, and the event is removed from the queue as usual: the data write that produced it already succeeded, so on the engine's side the event is done.

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
                  release lock ──trigger──> engine ──call endpoint──> workflow events ──validate, write (via scripts)──> tasks
```

- Only the write scripts (1.4) write the data files (1.1).
- Inside one lock, the script validates the record against the entity schema, stores the `_event` first, then writes the data file. The event is an outbox for the trigger, not the source of truth: the JSON files are.
- After releasing the lock, the script triggers the engine detached. The engine may write more data through the same scripts.
- The engine only reacts to changes made through the scripts. Data changed outside them (manual edits, git pull) does not trigger it for now.

#### 1.4. Scripts

Scripts are the only way to write `.superteam/data/`.

They share one library that handles:

- **Validation:** check the record against the entity schema.
- **`auto_id` allocation:** done under the write lock, reading the latest state from disk (not from an index).
- **Write lock:** every write takes it, so only one writer at a time across all instances.
- **Atomic write:** write a temp file, then rename, pretty-formatted JSON.
- **Trigger (outbox):** in the same lock as the data write, store an `_event` record in `.superteam/data/_event/`. The event carries the `target` (entity and id), the `operation`, the changed fields (old and new values), `causedBy` and `depth` (see `_event.schema.json`). Whoever creates an event fills `causedBy`: the write script, as given by its caller (null for a manual call, the skill name when a skill calls it), or the endpoint for the workflow events it returns (the `_workflow` id). After releasing the lock, start the engine (1) detached, so the write script is never blocked. Seeding skips this step (`--no-trigger`).

Register: a script that creates or renews a `_subscription`. Under the write lock it scans the existing `_subscription` records; there are few of them, so scanning is cheap. If one has the same `endpoint` and `topic`, it updates that record's `expiresAt` and `subscriber`; otherwise it creates a new record. The event is `update` or `create` accordingly.

Cleanup: a script, run manually, that deletes the expired `_subscription` records (`expiresAt` in the past). It is never run automatically. Expired records are ignored by the engine in the meantime, so cleaning up is only housekeeping.

### 2. AI Enhancement

The layer that lets AI agents use the engine: an optional index and MCP server for reading, skills that call the engine's scripts, and the brain that answers the engine's calls with Claude. As an external system, it creates the `_subscription` records that the engine uses to publish events. The engine (1) does not depend on it.

#### 2.1. MCP server

An optional enhancement of the read side. On top of the in-memory index table (2.1.1), the server gives AI agents a protocol to query project data. It is also the endpoint the engine publishes events to (2.1.2). It is read-only: it never writes to `.superteam/data/` (writes go through the scripts, see 1.4). Its tools query by those keys, such as the tasks of an assignee, the children of a task or the tasks with a given status. Query by id is not served by it: a record by id is always read directly from its data file (1.2).

- **Lifecycle:** a long-running process. Claude Code starts it (stdio) when a session starts and stops it when the session ends. It loads all JSON files once at startup and keeps the index in memory, so queries do not re-read files.
- **Registration:** besides stdio, it opens a listening address when it starts, on a random free port chosen by the operating system. For each topic the brain needs (2.1.2) it registers a `_subscription` with the register script (1.4): the `endpoint` is that address, the `subscriber` is the plugin name and version, and the `expiresAt` is now plus a TTL of 1 hour. While it runs it renews them every 13 minutes with the same script. When it stops, nothing removes them: they expire. If a new server gets the port of a dead one, the script finds the same `endpoint` and `topic` and updates that record instead of creating a duplicate. The records are written through the write scripts (1.4) like any other data. Each write enqueues an `_event`, but nothing subscribes to the `_subscription` topics, so it publishes nothing.
- **Multiple instances:** several sessions on one project each run their own server with their own index. This is safe because servers only read; the write lock lives in the scripts. Each registers its own subscriptions; for an event the engine calls them one at a time and stops at the first whose response is accepted, so only one brain handles an event.

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

##### 2.1.2. Brain

The endpoint the engine calls. In the real integration it is Claude, reached through the MCP server (2.1): the engine publishes an event to the MCP server, which triggers a Claude workflow.

- Input: the event and `depth`. Output: workflow events (see 1), each carrying `causedBy` (the `_workflow` it ran) and `depth`. The brain never writes data itself, and the engine checks its output against that `_workflow` (1).
- A Claude workflow is a Claude Code workflow (the Workflow tool: a JavaScript script that orchestrates agents with `agent()`, `parallel()`, `pipeline()`), following Claude's own workflow convention. The workflow files and the agents they call are generated from the `_workflow` and `_role` records by the installation (2.3).
- The Workflow tool only works inside a Claude session. Assumption, not yet verified: how the MCP server starts the workflow in a Claude session. Revisit when the brain is built.
- Without a brain, the engine still stores and serves data, but nothing answers its calls.

Topics the brain needs, as the `topic` of `_subscription` records whose `endpoint` is the MCP server. The MCP server (2.1) registers them when it starts (draft v0, to be adjusted when the first workflows are written):

| Topic | Starts |
| --- | --- |
| `_task:create` | intake of new work: break down, assign |
| `_task:update` | the assignee role starts working on a newly assigned task, or a reaction to approval, rejection or a request for approval; the brain reads `changes` to tell which |
| `_artifact:create` | review of the new artifact by the approver |

#### 2.2. Skills

Skills provided by the plugin:

| Skill | Syntax | Description |
| --- | --- | --- |
| Define role | `/superteam:def-role` | Use AI to create `_role` records, written through the scripts (1.4). |
| Define workflow | `/superteam:def-workflow` | Use AI to create `_workflow` records, written through the scripts (1.4). |
| Query data | `/superteam:query-data <entity> [id]` | Query project data. A record by id is always read directly from its data file (1.2). Other queries go through the MCP server (2.1) when it is available, otherwise by listing the data files (1.2). |

#### 2.3. Installation

Sets the project up to run with Claude Code. A script does two things: it transforms core entities into Claude Code files, following Claude's conventions, and it edits the project's `.gitignore`. It is run manually after the project data changes.

Transform:

| Entity | Claude Code file | Notes |
| --- | --- | --- |
| `_role` | `.claude/agents/{role}.md` | the role record (`description`, `tools`, `model`) combined with its `instructions` file |
| `_workflow` | `.claude/workflows/{workflow}.js` | generated from its entries, run by the brain (2.1.2) by name |

Edit:

| File | Change | Notes |
| --- | --- | --- |
| `.gitignore` | adds `.superteam/data/_event/` | `_event` is a temporary queue, not project data. |
| `.gitignore` | adds `.superteam/data/_subscription/` | `_subscription` records are runtime registrations that change while the MCP server runs, not project data. |

A line is added only if it is missing.

The script reads the JSON files directly, following the storage layout from 1.1 (no index, no MCP server). The Claude Code files and the `.gitignore` are written outside `.superteam/data/`, so they need no write lock.
