# Runtime data

`.superteam/.r/` holds the data that does not need to be kept in git. It is not
versioned.

## Component

| Folder                                                          | Holds                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.superteam/.r/tasks/{task_id}.json`, in the worktree of a work | A task of the work, and its progress.                                                                                          |
| `.superteam/.r/agents/{pid}.pid`                                | The pid of an agent process, with its job, one file for each agent.                                                            |
| `.superteam/.r/worktrees/`                                      | The folders of the worktrees (see "Worktrees" in `git-adapter.md`).                                                            |
| `.superteam/.r/engineloop/`                                     | The queue, the claim, the DLQ and the tmp folders of the engine loop (see `engineloop.md`).                                    |
| `.superteam/.r/superteam.log`                                   | The log of the process of superteam (see "Start" in `orchestrator.md`).                                                        |
| `.superteam/.r/superteam.lock`                                  | The pid of the process of superteam that runs, so that a second one does not start (see "Start" in `orchestrator.md`).         |
| `.superteam/.r/errors/{work_id}.json`                           | The error of the engine of a work whose event went to the DLQ, until it is retried, failed, approved or archived (see ADR 16). |

- **The work itself** is not runtime data. The engine writes it in
  `.superteam/.p/works/{id}.json` of the worktree of the work, and reads it
  there to build the prompts of the workers and to survive a restart (see
  `persistence-data.md`).
- **A task** is a step on the way to a work. It can be done again, and its
  history is not kept, because a work is handed over clean. It is in the runtime
  of the worktree of its work, so it is never merged, and it is removed with the
  worktree.
- **The pids**, with the jobs, are used at the start of the agent manager to
  kill the agents that are left (see "Code" in `agent-manager.md`).

The engine writes the runtime files of the tasks and the worktrees, from its
handlers, one event at a time, so there is no race between two writes. The agent
manager writes the pids. A worktree can read the runtime data of the root
branch, by reading the path in the root workspace.
