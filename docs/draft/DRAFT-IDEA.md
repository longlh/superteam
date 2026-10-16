# Superteam

## Goal

Build a workflow engine for projects that use Claude Code, delivered as a Claude
Code plugin (`superteam`).

## Overview

Every project has its own way of working. Superteam lets a project describe that
way (its team and its process) as data, and runs a team of Claude Code agents on
it.

The design has two layers:

- **Engine:** the `superteam` plugin. It is generic and installed into any
  project. It stores data, queues events, runs the process in code with no AI
  (1.5, 1.6), and sends events to an external API that is its brain, which does
  the work that needs AI. In the real integration the brain is Claude (the AI
  layer, 2).
- **Project:** the data of one project, stored in its own repo under
  `.superteam/data/`. It is what makes the process specific to that project.

## Data flow

Normal operation follows CQRS: writes (commands) and reads (queries) are
separate paths, both provided by the engine.

- **Write flow:** see 1.3. Scripts write the data files, then trigger the
  engine.
- **Read flow:** see 1.2. Records are read directly from the data files. The
  optional MCP server (2.1) enhances it with an in-memory index.

## Installation flow

Run manually after the project data changes, separate from normal operation:

```
.superteam/data/*.json ──read──> installation script ──> Claude Code files (agents), .gitignore
```

The installation script (2.3) reads the files directly, bypassing the index and
the MCP server.

## Components

### 1. Engine

The foundation of the plugin. It defines the core entities, stores and serves
their data, runs the process in code (1.5, 1.6) and sends events to an external
API that acts as its brain. The engine has no AI: the brain does the work that
needs AI, such as doing a task or approving a work. In the real integration the
brain is Claude (2.1.2). It is self-contained: it writes through its scripts
(1.4) and reads the data files directly (1.2).

Core entities are defined by the engine and have a `_` prefix. Their schemas are
JSON Schema files in `superteam-engine/src/schemas/`, named
`<entity>.schema.json`. Entities without the prefix belong to the project.

| Entity          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_work`         | A unit of work that follows a `_process` and is split into tasks; the tasks do the work (1.5). Its status is `OPEN`, `IN_PROGRESS` or `DONE`. A work is approved or rejected as a whole (1.6).                                                                                                                                                                                                                                                                                                                                                           |
| `_task`         | A part of a work, created by the engine from a step of the `_process`. It is assigned to a role and may wait for sibling tasks (1.5). Its status is `OPEN`, `IN_PROGRESS` or `DONE`.                                                                                                                                                                                                                                                                                                                                                                     |
| `_artifact`     | An output of a task, or of a work (the note of its approver), such as a document, source code or a pull request. It embeds the output or refers to it where it is stored. It records a result and is only ever created: a task that rewrites or deletes content in the project files creates a new artifact that records what it did.                                                                                                                                                                                                                    |
| `_role`         | A team member of the project, either `bot` or `human`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `_process`      | A named definition of a process: the steps of a flow, the role of each, and which steps each one waits for. It also holds the default instructions of each step. It knows nothing about `_work` and `_task`: the engine creates the tasks of a work from its steps (1.5).                                                                                                                                                                                                                                                                                |
| `_rejection`    | A record of a batch of process events the engine rejected: the brain that was called, the event sent, what the brain returned, and which checks it broke. A business error, recorded so the process, the instructions or the brain can be fixed; versioned in git.                                                                                                                                                                                                                                                                                       |
| `_subscription` | A subscription of an addon to events: which topic (`{entity}:{operation}`) is delivered to which addon (`addon`), and the names of the environment variables that configure it (`env`), such as the URL of a webhook. Every subscription of a topic receives its events, unlike a `_brain` (1.7). It is project data, with no TTL, and holds no secret.                                                                                                                                                                                                  |
| `_brain`        | A brain: which topic (`topic`, as `{entity}:{operation}`, such as `_work:create`) is sent to which `endpoint` (an address), and which implementation of the brain it is (`implementation`: name and version). It has a TTL (`expiresAt`): its creator renews it while it is alive, and one that is not renewed expires and is ignored. Created by an external system; the engine only reads it to know where to send events.                                                                                                                             |
| `_event`        | An outbox record written with each data write, which triggers the engine. The `_event` folder is a queue: the write scripts enqueue events in id order, and the engine dequeues each one by moving its file to another folder (1). The event id is only the order in the queue, not a unique identity: it can start over once the queue is drained. It also carries the hash of the record before and after the write and the path of a temp file, so the engine can check that the write completed (1.3). Immutable: once written it is never modified. |

Schemas use a few keywords of their own, which start with `x-`. They are not
part of JSON Schema: the standard validator ignores them. The shared library
(1.4) reads `x-type`, `x-scope` and `x-ref`; `x-level` is only a note for the
reader.

| Keyword   | Value                 | Meaning                                                                                                                                                                                                                                                                                                                                  |
| --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-type`  | `auto_id`             | The id of a record, allocated under the write lock as the next free integer, read from the latest state on disk.                                                                                                                                                                                                                         |
| `x-type`  | `auto_increment_int`  | An integer counter allocated under the write lock, starting at 1 and starting over for each value of `x-scope`.                                                                                                                                                                                                                          |
| `x-type`  | `path`                | The value is a path to a file.                                                                                                                                                                                                                                                                                                           |
| `x-scope` | a list of field names | Used with `auto_increment_int`. The key of the counter is the tuple of the values of these fields, and a field that is not set counts as null. For example `["task", "work"]` on the `version` of an `_artifact` counts per task for the artifact of a task and per work for the artifact of a work, because exactly one of them is set. |
| `x-ref`   | an entity name        | The value is the id of a record of that entity; for an array, each item is.                                                                                                                                                                                                                                                              |
| `x-level` | `engine` or `project` | Who defines the value of the field: `engine` when the engine does, in the shape the schema gives; `project` when the project picks the values, such as the id of a role or of a process. It is documentation only: no code acts on it.                                                                                                   |

The engine is a script. It is not a watcher or a background process: it only
runs when a write script (1.4) triggers it after changing data. Data changed
outside the scripts (manual edits, git pull) is not supported for now: it does
not trigger the engine. On each trigger it claims the events of the queue one at
a time (see below). For each event it first runs the process in code (1.5, 1.6),
then finds the `_brain` records that have not expired and whose `topic` is the
topic of the event, and calls their `endpoint` one at a time, the one with the
latest `expiresAt` first, until the response of one is accepted. The engine
relies only on this data.

The endpoint is the engine's brain. After a write, the engine sends it the event
(with its `target`) and expects a list of **process events** back: each is a
request, a payload, describing a write the brain wants to make for the task or
work it was asked to work on, such as adding an artifact or finishing the task.
If the event is not for the brain, for example a task update that no bot has to
act on, the brain returns an empty list. A process event is not an `_event` and
is never stored: it holds only what the brain can know (the target, the
operation, the fields to write and the `depth`), not the id, the hashes or the
temp path of an `_event`. The brain never creates an `_event`: the engine
applies each accepted process event by calling the write script (1.4), and that
script stores the `_event` of the write, as for any other write. If any process
event is rejected, the engine applies none of them, does not retry, and records
the rejection as a `_rejection`. This is a business error (the brain went beyond
what it was asked to do), unlike a failed call, which is a system error and is
not recorded. Accepted process events go through the write scripts (1.4), so
they use the same validation and write lock.

What the engine sends to the brain:

| Item         | What                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sent         | The `_event` record, unchanged. Nothing else is sent: not the data records, not the `_process`.                                                                                                                                                                                                                                                                                           |
| Topics       | Changes of an entity, by topic `{entity}:{operation}`: `_work:create`, `_work:update`, `_work:delete`, and so on. A `_brain` names the topic; the topic of an `_event` is its `target.entity` and its `operation`.                                                                                                                                                                        |
| Delivered to | The `endpoint` of one brain. The live brains of the topic are called one at a time, the one with the latest `expiresAt` first, and the first whose response the engine accepts wins: the others are not called.                                                                                                                                                                           |
| Sent along   | The `depth` the returned events must carry: the depth of the event plus one.                                                                                                                                                                                                                                                                                                              |
| Returned     | A list of process events (requests to write, not `_event` records), each with its `depth`. They are not sent to the brain: the engine validates them and applies them through the write scripts, and those writes enqueue new `_event` records. As soon as the brain has started an agent, the response may carry the header `X-Agent-Pid` with the pid of that agent, ahead of the body. |

The engine validates the returned list in code. The brain is asked to work on
one item, the one the event is about: a task that has just started, or a work to
approve.

1. `schema`: every returned process event is well formed (target, operation,
   fields to write and `depth`) and writes valid data (entity schemas).
2. `scope`: the events touch nothing but that task or work. For a task:
   `_artifact:create` with `task` set to that task (an artifact is never updated
   or deleted), and `_task:update` of that task that only sets `status` to
   `DONE`. For an approval: `_artifact:create` with `work` set to that work,
   which is the note of the approver, and `_work:update` of the work that only
   sets `approvedAt` and `approvedBy`, or `rejectedAt` and `rejectedBy`. A
   process event carries only these fields: the write fills the others, such as
   `updatedAt` and `updatedBy`, so the brain never sets them.
3. `approver`: the role in `approvedBy` or `rejectedBy` is one of the
   `canApprovedBy` of the work.
4. `depth`: it is the depth of the event plus one, and does not pass the depth
   limit.

A `_rejection` lists each violation: which of these checks was broken, and by
which returned event.

This validation is for the brain only. Events written through the scripts (by a
skill or manually) are checked against the entity schemas only.

How it consumes events:

- It claims events from `.superteam/data/_event/` one at a time, the lowest id
  first, and each claim is the dequeue: it moves the event file to
  `.superteam/claims/{pid}/`, a folder named by the pid of the engine process,
  an atomic rename that only one process can win. A process works on one event
  at a time, so the moved files never collide, even though event ids can start
  over. So an event is processed by exactly one engine process. There is no lock
  on the engine as a whole: every write triggers an engine process, and several
  run at the same time, each on its own event. This is what lets the tasks that
  do not depend on each other do their work in parallel, since each one waits
  for the brain on its own.
- Before it processes a claimed event, the engine checks, without any lock, that
  the write of the event completed. It compares the hash of the data file with
  the two hashes of the event. The new hash means the write is complete. A hash
  that is neither means a later write has replaced it, and writes are serialized
  by the write lock, so this write is complete too. The old hash means the write
  is not in place yet. If the event has a temp file, the write script may still
  be working: the engine waits for it, polling for up to 10 seconds, and if the
  temp file is still there after that, the script is considered dead and the
  engine drops the event and the temp file. The write was never reported done,
  so it is as if it never happened. If the event has no temp file on disk, the
  engine reads the data file once more, because the script may have just moved
  it; if the hash is still the old one, the event is invalid and is dropped. A
  delete has no temp file, so for a delete the engine waits the same way for the
  data file to go. An event that is dropped is not processed.
- A decision that reads data and then writes, such as setting a work to `DONE`
  when every task is `DONE`, is taken inside the write lock, on the latest state
  from disk. If another engine process has already changed the state, the
  decision is skipped, so the same step is never done twice.
- An event leaves the queue when it is claimed, and the moved file is deleted
  once the event is processed; the content of an event is never modified. An
  event is never lost: if an engine process dies midway, the event stays in the
  folder of its pid, and a manual command finds the pids that are no longer
  alive, puts their events back in the queue and re-runs them. The temp path in
  an event also lets a person find a temp file that was left behind and move it
  into place by hand, for an audit or to debug. This is a manual recovery step,
  not a watcher.
- When the engine calls an endpoint it passes the `depth` the returned events
  must carry (the depth of the event plus one). It refuses to go past a depth
  limit, so it cannot loop forever.
- The engine does not guess how long the brain's work takes: an agent can run
  for hours. The headers of the response must arrive within 1 minute. If they
  carry `X-Agent-Pid`, the engine records that pid in the claim, in a file next
  to the claimed event, and then waits for the body with no time limit, as long
  as the connection is open and the agent is alive; it is a failure when the
  connection drops or the agent dies. Only to catch a hung agent, the wait has a
  maximum, configurable, with a generous default; when it is passed, the engine
  stops the agent (its process group) and the call is a failure. An endpoint
  that sends no pid is given a limit of 10 minutes for the whole call,
  configurable.
- If a call fails for any reason (the endpoint cannot be reached, it times out,
  or its response cannot be read), the engine treats all failures the same way:
  it retries 3 times, after 1, 2 and 4 seconds, but never while an agent it
  recorded is still alive: that agent is still doing the work, and a retry would
  start a second one. If it still fails, the engine goes on to the next brain of
  the topic. A response that can be read but that the engine rejects is recorded
  as a `_rejection` and is not a call failure; the engine goes on to the next
  brain whose implementation (name and version) is different, because the same
  version would make the same mistake. When no brain is left, the engine gives
  up silently: nothing is recorded, and the event is removed from the queue as
  usual: the data write that produced it already succeeded, so on the engine's
  side the event is done.

#### 1.1. Storage

File-based. Layout:

```
.superteam/data/{entity}/{id}.json
```

Each record is one JSON file, stored pretty-formatted so text diffs stay
readable.

Core entities (`_` prefix) follow the same layout, e.g.
`.superteam/data/_task/1.json`.

#### 1.2. Read

Records are read directly from the data files by path pattern:

| Query                         | Path pattern                         |
| ----------------------------- | ------------------------------------ |
| get one record                | `.superteam/data/{entity}/{id}.json` |
| list the records of an entity | `.superteam/data/{entity}/*.json`    |

- Reads need no script: the data files are read natively.
- Reads go to disk, so they always see the latest write. They need no index and
  no running process.

#### 1.3. Write

```
write script ──lock──> validate ──> temp file (.superteam/tmp/, gitignored) ──hash──> event (.superteam/data/_event/, gitignored)
                                                                                       │
                                                                                       └──> move the temp file to the data file (.superteam/data/{entity}/{id}.json)
                  release lock ──trigger──> engine ──call endpoint──> process events ──validate, write (via scripts)──> works, tasks
```

- Only the write scripts (1.4) write the data files (1.1).
- Inside one lock, the script validates the record against the entity schema,
  writes the new content to a temp file under `.superteam/tmp/` and takes its
  hash, stores the `_event` (with the hash before and after the write and the
  path of the temp file), then moves the temp file onto the data file, an atomic
  rename. The event is an outbox for the trigger, not the source of truth: the
  JSON files are. A delete has no temp file: its event is stored first, then the
  data file is removed.
- The event is stored before the data file is in place, so the engine checks
  that the write completed before it processes the event (see "How it consumes
  events" in 1).
- After releasing the lock, the script triggers the engine detached. The engine
  may write more data through the same scripts.
- The engine only reacts to changes made through the scripts. Data changed
  outside them (manual edits, git pull) does not trigger it for now.

#### 1.4. Scripts

Scripts are the only way to write `.superteam/data/`.

They share one library that handles:

- **Validation:** check the record against the entity schema.
- **`auto_id` allocation:** done under the write lock, reading the latest state
  from disk (not from an index).
- **Write lock:** every write takes it, so only one writer at a time across all
  instances.
- **Atomic write:** write the pretty-formatted JSON to a temp file under
  `.superteam/tmp/`, then rename it into place. The hash of a record is the hash
  of the bytes of its file, so a writer and the engine always agree on it; the
  hash of a missing file is null.
- **Trigger (outbox):** in the same lock as the data write, store an `_event`
  record in `.superteam/data/_event/`. The event carries the `target` (entity
  and id), the `operation`, the changed fields (old and new values), the hash of
  the record before and after the write, the path of the temp file and `depth`
  (see `_event.schema.json`). After releasing the lock, start the engine (1)
  detached, so the write script is never blocked. Seeding skips this step
  (`--no-trigger`).

Register: a script that creates or renews a `_brain`. Under the write lock it
scans the existing `_brain` records; there are few of them, so scanning is
cheap. If one has the same `endpoint` and `topic`, it updates that record's
`expiresAt` and `implementation`; otherwise it creates a new record. The event
is `update` or `create` accordingly.

Finish: a script for a human to finish a task or to decide on a work. Writing
the artifact and the status by hand means building JSON that follows the
conventions of the entities, which a person rarely gets right, so the script
holds the conventions and the person only gives the content. It is a layer above
the write script: every write goes through the same pipeline.

- `finish task <id> --as <role> (--content <text> | --ref <reference>)`. `--as`
  is the role the person acts as, since an assignee is a role and not a person.
  The script checks that the role is a human role, and that the task is
  `IN_PROGRESS` and assigned to that role. It then creates an `_artifact` for
  the task, and sets the task to `DONE`. If it stops after the artifact, the
  task is still `IN_PROGRESS` and running it again adds a new artifact.
- `finish work <id> --as <role> (--approve | --reject) (--content <text> | --ref <reference>)`.
  The script checks that the role is a human role in `canApprovedBy`, and that
  the work is `DONE` with no decision yet. It creates the artifact that holds
  the note of the approver (1.6), then writes the decision.

Cleanup: a script, run manually, that deletes the expired `_brain` records
(`expiresAt` in the past). It is never run automatically. Expired records are
ignored by the engine in the meantime, so cleaning up is only housekeeping.

#### 1.5. Work flow

A work follows a `_process`. The engine runs the work flow in code, on the
events of the queue, with no AI. A work and a task each have the status `OPEN`,
`IN_PROGRESS` or `DONE`.

| When                                                                                                | Who               | What                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A work is created, and its `type` is the id of a `_process`                                         | Engine            | Creates one task for each step of the process, with status `OPEN`: `work` is the work, `assignee` is its role, `dependOn` points to the sibling tasks it waits for, and `instructions` is the `customInstructions` of the work for that name if there is one, else the default of the step. |
| A task has no `dependOn` that is not `DONE`, at creation or when its last dependency becomes `DONE` | Engine            | Sets it to `IN_PROGRESS`. Tasks that do not depend on each other start at the same time.                                                                                                                                                                                                    |
| A task is `IN_PROGRESS`                                                                             | Its assignee role | Does the work and writes its `_artifact` records, then sets the task to `DONE`. A bot role does it through the brain (2.1.2), a human role with the finish script (1.4).                                                                                                                    |
| Every task of a work is `DONE`                                                                      | Engine            | Sets the work to `DONE`. The approval (1.6) starts.                                                                                                                                                                                                                                         |

- A task that is `OPEN` while a `dependOn` is not `DONE` is waiting for its
  turn.
- A work is `IN_PROGRESS` as soon as one of its tasks is. Its progress, the
  number of `DONE` tasks over all tasks, is computed when it is read and is not
  stored.
- `DONE` only says the work is finished, not that it succeeded. The result of a
  task is its artifacts: a review that finds problems still ends `DONE`, and its
  artifact says what it found.

#### 1.6. Approval flow

The approval is a separate flow from the work flow, and it applies only to the
work. The tasks were delegated to the members, so only the result of the whole
team is approved.

- It starts when the work is `DONE`. The approver is a role in `canApprovedBy`,
  a list the creator of the work sets when creating it. When it is omitted it is
  `["human"]`, so no agent approves by default. `human` is a keyword, not the id
  of a role: it stands for every role of kind `human`. A role is in
  `canApprovedBy` if its id is listed, or if `human` is listed and its kind is
  `human`; this is what the checks of the approver (1, 1.4) mean by "in
  `canApprovedBy`".
- If `canApprovedBy` has a bot role, the engine assigns the work to the first
  one, and the brain (2.1.2) decides from the content of the work and the
  artifacts of all its tasks. If it has only human roles, nothing happens and a
  human approves or rejects with the finish script (1.4).
- The decision is written in the work as `approvedAt` and `approvedBy`, or
  `rejectedAt` and `rejectedBy`. Both decisions need a note, and the note is an
  `_artifact` with `work` set to the work, written before the decision, so it is
  a record like any other result and is never edited. The write script refuses a
  decision on a work that has no artifact of its own, for a human as well as for
  a bot. The engine checks that the role is in `canApprovedBy`.
- A rejected work stays rejected. It is a final state, and the engine does not
  redo it. To redo it, a person or a skill creates a new work whose `previous`
  is the rejected work, so the history of the attempts stays linked and the
  artifact of the approver is the input of the new one. `previous` is optional
  and is not limited to this flow: a work can also follow a finished work that
  it continues.

#### 1.7. Addons

An addon extends the engine, with no AI, through pub/sub on the topics it wants:
it is code of the plugin that reacts to events, such as posting a message to a
Google Chat space when a task starts for a human. This is the traditional
pub/sub: every `_subscription` whose topic matches an event receives it, and
nothing is returned to the engine. It is not the integration of the brain, which
is a single call that returns process events (1).

- A `_subscription` names the `topic` and the `addon`, and its `env` maps the
  names the addon expects to the names of environment variables, such as the URL
  of a webhook. The value of a variable is a secret and stays in the environment
  of the process: the data holds only the names, because it is versioned in git.
  A `_subscription` is project data, with no TTL.
- The addon filters by itself. It receives every event of its topic, decides
  whether to act, and builds its own content, reading the records it needs from
  the data files. For example an addon on `_task:update` acts only when the task
  has just become `IN_PROGRESS` and is assigned to a human role.
- The engine delivers an event to the addons before it calls the brain, so a
  notification is sent before the brain starts a job that may last hours. An
  addon has a short time to answer, 10 seconds. One that fails or is too slow is
  skipped: it does not stop the event, the other addons or the brain, and it is
  not retried.
- An addon is a file in `superteam-engine/src/addons/`. The first one is
  `googlechat`, which posts to the webhook of a Google Chat space. For now only
  the addons built into the plugin are supported: a project cannot add its own,
  and there is no skill to create a `_subscription`, which is written through
  the write script.

### 2. AI Enhancement

The layer that lets AI agents use the engine: an optional index and MCP server
for reading, skills that call the engine's scripts, and the brain that answers
the engine's calls with Claude. As an external system, it creates the `_brain`
records that the engine uses to know where to send events. The engine (1) does
not depend on it.

#### 2.1. MCP server

An optional enhancement of the read side. On top of the in-memory index table
(2.1.1), the server gives AI agents a protocol to query project data. It is also
the endpoint the engine sends events to (2.1.2). It never writes to
`.superteam/data/` itself: the writes it needs, the registration and the
recovery below, go through the scripts (1.4). Its tools query by those keys,
such as the tasks of an assignee, the tasks of a work or the tasks with a given
status. Query by id is not served by it: a record by id is always read directly
from its data file (1.2).

- **Lifecycle:** Claude Code starts one server process (stdio) when a session
  starts and stops it when the session ends, so every session has one. The
  server is a singleton per project: only one of them is the **leader**, the
  others are **followers**. A follower forwards its queries to the leader. The
  leader loads all JSON files once, keeps the index in memory so queries do not
  re-read files, owns the file watcher, and acts as the brain endpoint (2.1.2).
  There is no separate daemon: the leader is the server of one of the sessions.
- **Leader election:** the leader is whoever holds the leader file
  `.superteam/pid`, which records its pid and its listening address. Every
  server checks it when it starts and then every 3 seconds. The check reads the
  file and tests the pid first, which is the cheaper test; only if the process
  is alive does it call the healthcheck of the leader at its address. Nothing
  changes while the leader is alive. The healthcheck is for the rare case where
  the operating system gave the pid to another process: it returns a secret
  value, a random value generated at installation (2.3), and the caller compares
  it with its own copy, so only a real leader of this project passes. If the
  file is missing, its pid is not alive or the healthcheck fails, the server
  volunteers: it claims the file with an exclusive create, so only one volunteer
  wins. The winner becomes the leader (it loads the index, starts the watcher,
  opens the listening address and registers its `_brain` records); the others
  stay followers. When the leader stops, its file goes stale; at the next check
  one follower takes over. A server started with the environment variable
  `SUPERTEAM__MEMBER_ONLY` set never volunteers: it stays a follower. The brain
  sets it for the agents it spawns (2.1.2), so a short-lived agent never becomes
  the leader.
- **Registration:** only the leader registers. It opens a listening address on a
  random free port chosen by the operating system and writes it in the leader
  file. For each topic the brain needs (2.1.2) it registers a `_brain` with the
  register script (1.4): the `endpoint` is that address, the `implementation` is
  the plugin name and version, and the `expiresAt` is now plus a TTL of 1 hour.
  While it runs it renews them every 13 minutes with the same script. When it
  stops, nothing removes them: they expire. A new leader normally has a new
  port, so it creates new records; the old ones expire, and the engine calls the
  one with the latest `expiresAt` first. If it gets the port of a dead leader,
  the script finds the same `endpoint` and `topic` and updates that record
  instead of creating a duplicate. Until a follower takes over, the engine may
  call the dead endpoint: the call fails and the engine handles it as any failed
  call (1). The records are written through the write scripts (1.4) like any
  other data. Each write enqueues an `_event`, but no brain is registered for
  the `_brain` topics, so nothing is sent.
- **Singleton:** several sessions on one project each run a server, but only the
  leader has an index, a watcher and `_brain` records, so only one brain handles
  an event. This is safe because the write lock lives in the scripts.
- **Recovery:** the leader looks for work that nobody is doing: once when it
  becomes the leader, after it has registered its `_brain` records, and then
  every 13 minutes, on the timer that renews them. It looks for a `_task` that
  is `IN_PROGRESS` with a bot assignee, and a `_work` that is `DONE`, given to a
  bot role for approval, with no decision yet. A record counts as abandoned only
  if no event about it is waiting in the queue (`.superteam/data/_event/`), no
  event about it is claimed by an engine process that is alive
  (`.superteam/claims/`, 1), and no agent recorded in a claim is alive. The
  leader reads the queue first and the claims after: an event moves from the
  queue to the claims, so an event that is no longer in the queue is already in
  the claims, and none is missed. Without the queue check, a record whose event
  has not been claimed yet would look abandoned and would be started twice. For
  each abandoned record the leader asks the write script to touch it (it updates
  `updatedAt` and sets `recoveries` to 1), so the engine sends an event and the
  brain answers it as it would the first time. A record is recovered at most
  once: one whose `recoveries` is already 1 is left alone, for a person to look
  at, so a task that always fails is not run again and again at a cost each
  time. This repairs what would otherwise stay stuck: an event that found no
  brain, for example because no session was open, is gone from the queue, but
  the state it was about is still on disk.

##### 2.1.1. In-memory index table

A JS script loads the JSON files into memory, builds indexes, and exposes
queries for fast access by key. It owns the file watcher, which drives the
re-index on change events.

What is indexed:

| Item         | Rule                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Indexed keys | Keys other than id, declared in the entity schemas. Typically foreign keys (fields that reference another entity). |
| Not indexed  | `id`: a record by id is read directly from its data file (1.2).                                                    |
| Current set  | None declared yet. Keys are added to the schemas as real query needs appear.                                       |

When it re-indexes:

| Trigger      | Scope                                                               | Notes                                                                                                                                          |
| ------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap    | All records, all indexes                                            | When the MCP server starts.                                                                                                                    |
| Change event | The changed record only: its entries are added, replaced or removed | When the file watcher sees a data file created, changed or deleted, whoever made the change (scripts, manual edits, git pull, other sessions). |
| Manual       | All records, rebuilt from scratch                                   | On demand through a reload tool of the server. Recovery when the watcher missed an event.                                                      |

A change to the declared keys in a schema takes effect at the next bootstrap or
manual rebuild.

##### 2.1.2. Brain

The endpoint the engine calls. In the real integration it is Claude, reached
through the MCP server (2.1): the engine sends an event to the MCP server, which
starts a Claude agent for the task or work by spawning a child `claude -p`.

- Input: the event and `depth`. Output: process events (see 1), each carrying
  its `depth`. The brain never writes data itself, and the engine checks its
  output (1).
- The MCP server reads the task or work from the data files before it spawns
  anything. It acts only in two cases: a task that is `IN_PROGRESS` and whose
  `assignee` is a bot role, and a work that is `DONE` and assigned to a bot role
  for approval. In every other case it answers with an empty list and starts
  nothing.
- For a task, the prompt is made of the instructions of the role, the
  `instructions` of the task, the content of its work, the artifacts of the
  approver of the rejected work that its work redoes (`previous`), and the
  artifacts of the tasks it depends on. For an approval, it is the content of
  the work and the artifacts of all its tasks.
- In the project directory, it runs
  `claude -p '<prompt>' --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>`,
  with the agent of the role (`.claude/agents/{role}.md`) and the tools of the
  role allowed, and stdin from `/dev/null`. The validated result is in the
  `structured_output` field of the JSON output.
- The child session inherits the environment and signs in with the user's own
  account, so it needs no API key. The brain also sets `SUPERTEAM__MEMBER_ONLY`
  in it. The child starts its own MCP server like any session, and the variable
  keeps that server a follower of the leader (2.1).
- The agent runs as a process group of its own. As soon as it is spawned the
  brain sends the headers of the response, with the pid of `claude` in
  `X-Agent-Pid`, and it sends the body, the process events, when the agent has
  finished. The engine records the pid in the claim (1), which lets it wait for
  the agent as long as it is alive, and tells the recovery of the leader (2.1)
  that the task is being worked on.
- Without a brain, the engine still stores and serves data and runs the process,
  but a task or an approval given to a bot role is never done.

Topics the brain needs, as the `topic` of `_brain` records whose `endpoint` is
the MCP server. The MCP server (2.1) registers them when it starts:

| Topic          | Starts                                                |
| -------------- | ----------------------------------------------------- |
| `_task:update` | a task that the engine has just set to `IN_PROGRESS`  |
| `_work:update` | a work that the engine has just assigned for approval |

#### 2.2. Skills

Skills provided by the plugin:

| Skill          | Syntax                                | Description                                                                                                                                                                                         |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define role    | `/superteam:def-role`                 | Use AI to create `_role` records, written through the scripts (1.4).                                                                                                                                |
| Define process | `/superteam:def-process`              | Use AI to create `_process` records, written through the scripts (1.4).                                                                                                                             |
| Finish         | `/superteam:finish <task\|work> <id>` | Help a person finish a task or decide on a work: Claude asks for the role the person acts as, and for the content, then calls the finish script (1.4). It writes nothing by itself.                 |
| Query data     | `/superteam:query-data <entity> [id]` | Query project data. A record by id is always read directly from its data file (1.2). Other queries go through the MCP server (2.1) when it is available, otherwise by listing the data files (1.2). |

#### 2.3. Installation

Sets the project up to run with Claude Code. A script does three things: it
transforms the roles into Claude Code agents, following Claude's conventions, it
edits the project's `.gitignore`, and it generates the secret value of the MCP
server healthcheck (2.1). It is run manually after the project data changes.

Transform:

| Entity  | Claude Code file           | Notes                                                                                   |
| ------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `_role` | `.claude/agents/{role}.md` | the role record (`description`, `tools`, `model`) combined with its `instructions` file |

Edit:

| File         | Change                         | Notes                                                                                               |
| ------------ | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `.gitignore` | adds `.superteam/data/_event/` | `_event` is a temporary queue, not project data.                                                    |
| `.gitignore` | adds `.superteam/data/_brain/` | `_brain` records are runtime registrations that change while the MCP server runs, not project data. |
| `.gitignore` | adds `.superteam/pid`          | The leader file of the MCP server (2.1) is a runtime file, not project data.                        |
| `.gitignore` | adds `.superteam/secret`       | The secret is specific to one installation, so it is not shared through git.                        |
| `.gitignore` | adds `.superteam/claims/`      | The events the engine processes are runtime files, not project data.                                |
| `.gitignore` | adds `.superteam/tmp/`         | The temp files of the write scripts are runtime files, not project data.                            |

A line is added only if it is missing.

Generate:

| File                | Content        | Notes                                                                                                                                                  |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.superteam/secret` | a random value | Returned by the healthcheck of the MCP server leader (2.1). Created only if the file is missing, so running the installation again does not change it. |

The script reads the JSON files directly, following the storage layout from 1.1
(no index, no MCP server). The Claude Code files, the `.gitignore` and the
secret are written outside `.superteam/data/`, so they need no write lock.
