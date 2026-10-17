# Storage

Where the engine keeps its state. The entities are described in
`data-struct.md`, and the engine that uses the storage in `engine.md`.

## What is decided

- The storage is file-based, under `{baseDir}/.superteam/`, where `baseDir` is
  the root workspace, the place where the engine runs.
- The folder `.superteam/.w/` belongs to the event loop: the queue, the claim,
  the DLQ and the tmp folders (see `eventloop.md`). The storage does not use it.
- The runtime data of the storage is in `.superteam/.s/`. It is not versioned
  with git.
- The persistent data is in `.superteam/.p/`. It is versioned with git.
- A worker works in its git worktree. It reads the task from the runtime data
  and creates its artifacts in `.superteam/.p/`, on its own branch. It does not
  change the persistent data of the root branch, so the persistent data does not
  affect the worktrees of the workers.
- The approver works on the root branch, and changes the entities in
  `.superteam/.p/` there. The approver commits them.
- An entity is one file, and its path comes from its identity.
- The file of an entity is JSON, with a `version` field (see "Version" in
  `engine.md`). The event loop reads this field to check a write.
- Only the event loop writes to the storage of the root branch. It replaces a
  whole file, so a write carries the whole new content of the entity. A git
  worktree is a runtime environment: what is written there does not go through
  the event loop.
- Only part of the storage is versioned with git. Runtime data is not.

## Persistent directory

`.superteam/.p/` holds:

| Entity        | Path                                                       |
| ------------- | ---------------------------------------------------------- |
| Work          | `.superteam/.p/works/{id}.json`                            |
| Workflow      | `.superteam/.p/workflows/{name}.json`                      |
| Workflow step | `.superteam/.p/workflows/{workflow_name}/{step_name}.json` |
| Artifact      | `.superteam/.p/artifacts/{work_id}/{id}.json`              |

A work is persistent because it must outlive the machine: when the workspace
moves to another device, the work can be started again, and what was done can be
seen again.

## Runtime directory

`.superteam/.s/` holds:

| Entity | Path                                           |
| ------ | ---------------------------------------------- |
| Task   | `.superteam/.s/tasks/{work_id}/{task_id}.json` |

A task is a step on the way to a work. It can be done again, and its history is
not kept, because a work is handed over clean.

## Artifacts

An artifact is always in `.superteam/.p/artifacts/{work_id}/{id}.json`. It is
created once and never updated.

A task creates its artifacts in its git worktree, with a standalone script that
the worker runs. The script computes the `id`, builds the JSON of the entity and
writes the file. The worker commits it on its branch. The artifacts reach the
root branch when the branches are merged, as the work is approved, so they are
already in the right place, and no conflict can happen on them.

The `id` is a hash (SHA-256, hex) of the `work_id`, the `task_id`, the
`createdAt` and the `index` of the artifact. The `index` is its position among
the artifacts that a task creates at once. There is no counter to share, because
the tasks run in parallel.

## What the storage must give

These come from the other documents. They are what the layout has to make easy.

| Need                                     | Who needs it                     |
| ---------------------------------------- | -------------------------------- |
| Read one entity from its identity        | The API (query), the reactor     |
| List the tasks of a work                 | The API, the derived status      |
| List the tasks that a task depends on    | The derived status of a task     |
| Know the `target` path of an entity      | The command builder              |
| Know which entity a `target` path is for | The reactor, on `write:done`     |
| Keep the runtime data out of git         | The git worktrees of the workers |

## Open questions

These are not decided yet.

1. **The identity.** The format of `id` for a work and a task: a counter, a
   random id, or a slug. The path comes from it, and a counter needs the same
   care as the `order` of the event loop. The `id` of an artifact is decided
   (see "Artifacts").
