# Runtime data

`.superteam/.r/` holds the data that does not need to be kept in git. It is not
versioned.

## Component

| Folder                                         | Holds                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.superteam/.r/works/{id}.json`                | The record of a work.                                                                       |
| `.superteam/.r/tasks/{work_id}/{task_id}.json` | A task, and its progress.                                                                   |
| `.superteam/.r/workers/{pid}.pid`              | The pid of a worker process, one file for each worker.                                      |
| `.superteam/.r/worktrees/`                     | The folders of the worktrees (see "Worktrees" in `agents.md`).                              |
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
