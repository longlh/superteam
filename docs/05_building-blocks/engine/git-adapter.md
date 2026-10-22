# Git adapter

The way the engine reaches git and the forge.

## Component

The engine does not keep a store for the results or for the approvals. Git is
the platform, and each part of it has a job:

| Git                       | Job                                                        |
| ------------------------- | ---------------------------------------------------------- |
| Worktree                  | An environment of its own for each job.                    |
| Remote branch             | Where the results are kept.                                |
| Pull request              | The way a work is approved: the approver reviews it there. |
| Merge of the pull request | The way a result is recorded, as rebase and squash.        |

The engine reaches git and the forge through a git adapter, so that another
forge can be added later. For now only GitHub is supported, and the adapter
needs the `gh` command line.

### Branches

The branches of the tasks of a work are deleted when the work ends, so that they
do not pile up as garbage. The branch of the work is deleted when the work is
approved, because its result is then in the root branch. When the work fails or
is rejected, the branch of the work is pushed and kept on the remote: it is the
only trace of the work. It is deleted when the work is archived (see "Archive a
work" in `orchestrator.md`).

## Code

### Worktrees

A worktree is the environment where a job is done. There are two kinds, one for
each unit of the work. The engine creates both.

|          | Worktree of a work                                                                      | Worktree of a task                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Based on | The root branch.                                                                        | The branch of the task it depends on. A task with no dependency is based on the root branch. A task with more than one dependency is based on one of them. |
| Branch   | `works/{work_id}`                                                                       | `tasks/{work_id}/{task_id}`                                                                                                                                |
| Folder   | `.superteam/.r/worktrees/works/{work_id}`                                               | `.superteam/.r/worktrees/tasks/{work_id}/{task_id}`                                                                                                        |
| Created  | When the work is assigned.                                                              | When the task starts.                                                                                                                                      |
| Removed  | After the pull request is opened, or when the work fails.                               | When the task ends.                                                                                                                                        |
| Used for | The engine writes the work, and the work merger merges the branches of the final tasks. | The job of the task, by a worker, a person or an AI.                                                                                                       |

The folders of the worktrees are runtime data, so they are under
`.superteam/.r`. The folder of a task is not inside the folder of its work: a
folder inside a worktree would show up there as an untracked file.

The worktree of a work also holds the tasks of the work, in its own
`.superteam/.r/tasks/`. They are not committed, because `.superteam/.r/` is in
the `.gitignore`, and they are removed with the worktree.

The branch of a worktree is kept after the worktree is removed, because it is
merged later, or because it is the trace of a work that failed or was rejected
(see "Branches").
