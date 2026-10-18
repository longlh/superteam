# Storage

Where the data is kept. The entities are described in `data-struct.md`, and the
engine that uses the storage in `engine.md`.

The storage is file-based, under `{baseDir}/.superteam/`, where `baseDir` is the
root workspace, the place where the engine runs. The data has two kinds (see the
principles in `architecture.md`), and each kind has one folder:

| Folder           | Kind        | In git |
| ---------------- | ----------- | ------ |
| `.superteam/.p/` | Persistence | Yes    |
| `.superteam/.r/` | Runtime     | No     |

An entity is one JSON file, and its path comes from its identity.

## Persistence

`.superteam/.p/` holds the data that must be kept in git: so that people can
work across devices, and so that the history of the work is kept. The unit of
the history is the work.

| Entity        | Path                                                       |
| ------------- | ---------------------------------------------------------- |
| Work          | `.superteam/.p/works/{id}.json`                            |
| Workflow      | `.superteam/.p/workflows/{name}.json`                      |
| Workflow step | `.superteam/.p/workflows/{workflow_name}/{step_name}.json` |
| Artifact      | `.superteam/.p/artifacts/{work_id}/{id}.json`              |

The root branch does not create persistence data directly. The data is created
in a worktree, kept on its branch, and reaches the root branch as the result of
merging the pull request of the work. So the root branch never has a persistence
file that is not committed, and pulling the merged pull request causes no
conflict. What is written in a worktree does not go through the engine loop.

### Artifacts

An artifact is always in `.superteam/.p/artifacts/{work_id}/{id}.json`. It is
created once and never updated.

A task creates its artifacts in its worktree, with a standalone script that the
worker runs. The script computes the `id`, builds the JSON of the entity and
writes the file. The worker commits it on its branch. The artifacts reach the
root branch when the pull request is merged, so they are already in the right
place, and no conflict can happen on them.

The `id` is a hash (SHA-256, hex) of the `work_id`, the `task_id`, the
`createdAt` and the `index` of the artifact. The `index` is its position among
the artifacts that a task creates at once. There is no counter to share, because
the tasks run in parallel.

## Runtime

`.superteam/.r/` holds the data that does not need to be kept in git. It is not
versioned.

| Folder                                         | Holds                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.superteam/.r/works/{id}.json`                | The record of a work.                                                                       |
| `.superteam/.r/tasks/{work_id}/{task_id}.json` | A task, and its progress.                                                                   |
| `.superteam/.r/workers/{pid}.pid`              | The pid of a worker process, one file for each worker.                                      |
| `.superteam/.r/worktrees/`                     | The folders of the worktrees (see "Worktree" in `architecture.md`).                         |
| `.superteam/.r/engineloop/`                    | The queue, the claim, the DLQ and the tmp folders of the engine loop (see `engineloop.md`). |

- **The record of a work** holds the work as the client assigned it (title,
  description, DOD, workflow), so that the engine can build the prompts of the
  workers and survive a restart. The record of a work that is rejected stays
  here: the engine loop creates it at the time it rejects the work, because a
  rejected work is never merged, and so never reaches `.p`.
- **A task** is a step on the way to a work. It can be done again, and its
  history is not kept, because a work is handed over clean.
- **The pids** are used at the start of the engine to kill the workers that are
  left (see "Life cycle" in `engine.md`).

The engine writes the runtime files, from its handlers, one event at a time, so
there is no race between two writes. A worktree can read the runtime data of the
root branch, by reading the path in the root workspace, or by calling a read API
of the engine.

## Branches

The branches of a work (its own branch and the branches of its tasks) are
deleted when the work ends, so that they do not pile up as garbage.

## Open questions

These are not decided yet.

1. **The record of a work.** Its fields. The path above is a proposal.
2. **The identity.** The format of `id` for a work and a task: a counter, a
   random id, or a slug. The path comes from it. The `id` of an artifact is
   decided (see "Artifacts").
3. **The folder of the engine loop.** `engineloop.md` and its code still use
   `.superteam/.e/`. They have to move to `.superteam/.r/engineloop/`.
