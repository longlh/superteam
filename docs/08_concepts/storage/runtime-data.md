# Runtime data

`.superteam/.r/` holds the data that does not need to be kept in git. It is not
versioned.

## Component

| Folder                                         | Holds                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.superteam/.r/works/{id}.json`                | The record of a work.                                                                       |
| `.superteam/.r/tasks/{work_id}/{task_id}.json` | A task, and its progress.                                                                   |
| `.superteam/.r/agents/{pid}.pid`               | The pid of an agent process, with its job, one file for each agent.                         |
| `.superteam/.r/worktrees/`                     | The folders of the worktrees (see "Worktrees" in `git-adapter.md`).                         |
| `.superteam/.r/engineloop/`                    | The queue, the claim, the DLQ and the tmp folders of the engine loop (see `engineloop.md`). |

- **The record of a work** holds the work as the client assigned it (title,
  description, DOD, workflow), so that the engine can build the prompts of the
  workers and survive a restart. The record of a work that is rejected or failed
  stays here: the engine creates it at the time it rejects the work, because a
  rejected work is never merged, and so never reaches `.p`.
- **A task** is a step on the way to a work. It can be done again, and its
  history is not kept, because a work is handed over clean.
- **The pids**, with the jobs, are used at the start of the agent manager to
  kill the agents that are left (see "Code" in `agent-manager.md`).

The engine writes the runtime files of the works, the tasks and the worktrees,
from its handlers, one event at a time, so there is no race between two writes.
The agent manager writes the pids. A worktree can read the runtime data of the
root branch, by reading the path in the root workspace.
