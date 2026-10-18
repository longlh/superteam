# Storage

Where the data is kept. The entities are described in `data-struct.md`, and the
engine that uses the storage in `engine.md`.

The storage is file-based, under `{baseDir}/.superteam/`, where `baseDir` is the
root workspace, the place where the engine runs. It has four folders:

| Folder           | Kind       | Owner       | In git |
| ---------------- | ---------- | ----------- | ------ |
| `.superteam/.p/` | Persistent | Worker      | Yes    |
| `.superteam/.s/` | Runtime    | Engine      | No     |
| `.superteam/.r/` | Runtime    | Engine      | No     |
| `.superteam/.e/` | Runtime    | Engine loop | No     |

- **`.p`** holds the persistent data: what must outlive the machine. It is in
  git.
- **`.s`** holds the runtime state of the works and of the tasks.
- **`.r`** holds the pids of the worker processes.
- **`.e`** belongs to the engine loop: the queue, the claim, the DLQ and the tmp
  folders (see `engineloop.md`). The storage does not use it.

An entity is one JSON file, and its path comes from its identity.

## Persistent directory

`.superteam/.p/` holds:

| Entity        | Path                                                       |
| ------------- | ---------------------------------------------------------- |
| Work          | `.superteam/.p/works/{id}.json`                            |
| Workflow      | `.superteam/.p/workflows/{name}.json`                      |
| Workflow step | `.superteam/.p/workflows/{workflow_name}/{step_name}.json` |
| Artifact      | `.superteam/.p/artifacts/{work_id}/{id}.json`              |

A work is persistent because it must outlive the machine: when the workspace
moves to another device, what was done can be seen again.

The persistent data reaches the root branch only through git: it is written in a
worktree, kept on a branch, and merged into the root branch with the pull
request of the work. The root branch never has a persistent file that is not
committed, so pulling the merged pull request causes no conflict. The worktrees
are a runtime environment, so what is written there does not go through the
engine loop.

## Runtime directory

`.superteam/.s/` holds:

| Entity | Path                                           |
| ------ | ---------------------------------------------- |
| Task   | `.superteam/.s/tasks/{work_id}/{task_id}.json` |

A task is a step on the way to a work. It can be done again, and its history is
not kept, because a work is handed over clean.

The engine also keeps a record for each work that was given to it. The record
holds the work as the client assigned it (title, description, DOD, workflow), so
that the engine can build the prompts of the workers and survive a restart. The
record of a work that is rejected stays here: the engine loop creates it at the
time it rejects the work, because a rejected work is never merged, and so never
reaches `.p`.

Only the engine writes the runtime files, from its handlers, one event at a
time. So there is no race between two writes.

## Process directory

`.superteam/.r/workers/{pid}.pid` is one file for each worker process. The
engine records the pid when it spawns the worker, and uses these files at the
start to kill the workers that are left (see "Life cycle" in `engine.md`).

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

## Branches

The branches of a work (its own branch and the branches of its tasks) are
deleted when the work ends, so that they do not pile up as garbage.

## Open questions

These are not decided yet.

1. **The record of a work.** Its path and its fields.
2. **The identity.** The format of `id` for a work and a task: a counter, a
   random id, or a slug. The path comes from it. The `id` of an artifact is
   decided (see "Artifacts").
3. **The tasks in the worktree of the work.** `engine.md` says that the engine
   writes the work and the tasks in the worktree of the work when it assigns the
   work. Where the tasks go there, and whether they reach git, is not decided:
   the file of a task is in `.superteam/.s/`.
