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
| Merge of the pull request | The way a result is recorded, as a squash merge.           |

The engine reaches git and the forge through a git adapter, so that another
forge can be added later. For now only GitHub is supported, and the adapter
needs the `gh` command line. It runs `gh` on the repository of `origin`, with
`--repo`, because `gh` could choose another remote, such as the `upstream` of a
fork. It runs git and `gh` with `LC_ALL=C`, because it reads some of their
errors, which are in English only then.

The adapter also checks the setup of the project:

- `hasOrigin()` says whether the project has a git remote named `origin`.
- `rootUpstream()` returns the branch on `origin` that the root branch tracks,
  its upstream, such as `develop`, or null when it tracks no branch on `origin`.
  Its name can differ from the name of the root branch.
- `hasRemoteBranch(branch)` says whether `origin/<branch>` exists.
- `checkForge()` says whether `gh` is signed in (`gh auth status`).
- `ensureExcluded(line)` adds a line to the exclude file of the git common dir,
  when it is missing. The exclude file is shared by all the worktrees.

### Branches

The branches of the tasks of a work are deleted when the work ends, so that they
do not pile up as garbage. The branch of the work is deleted when the work is
approved, because its result is then in the `base` of the work. When the work
fails or is rejected, the branch of the work is pushed and kept on the remote:
it is the only trace of the work. It is deleted when the work is archived (see
"Archive a work" in `orchestrator.md`).

The pull request of a work is opened on the `base` of the work, the upstream
branch that the work is based on (`gh pr create --base <base>`). Without
`--base`, `gh` would open it on the default branch of the repository.

The engine reads what is committed with git, and never from the files of the
root workspace: the workflow from the upstream of the root branch, and an
approved work from the branch on which its pull request was merged. The approved
works are found from the merged pull requests of the branches `works/*`. The
engine never pulls, merges or commits into the local root branch (see ADR 15).

## Code

### Worktrees

A worktree is the environment where a job is done. There are two kinds, one for
each unit of the work. The engine creates both.

|          | Worktree of a work                                                                          | Worktree of a task                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Based on | The upstream of the root branch, after a fetch. Its name is kept in the `base` of the work. | The branch of the task it depends on. A task with no dependency is based on the branch of its work. A task with more than one dependency is based on one of them. |
| Branch   | `works/{work_id}`                                                                           | `tasks/{work_id}/{task_id}`                                                                                                                                       |
| Folder   | `.superteam/.r/worktrees/works/{work_id}`                                                   | `.superteam/.r/worktrees/tasks/{work_id}/{task_id}`                                                                                                               |
| Created  | When the work is assigned.                                                                  | When the task starts.                                                                                                                                             |
| Removed  | After the pull request is opened, or when the work fails.                                   | When the task ends.                                                                                                                                               |
| Used for | The engine writes the work, and the work merger merges the branches of the final tasks.     | The job of the task, by a worker, a person or an AI.                                                                                                              |

The folders of the worktrees are runtime data, so they are under
`.superteam/.r`. The folder of a task is not inside the folder of its work: a
folder inside a worktree would show up there as an untracked file.

The worktree of a work also holds the tasks of the work, in its own
`.superteam/.r/tasks/`. They are not committed, because `.superteam/.r/` is in
the `.gitignore`, and they are removed with the worktree.

The branch of a worktree is kept after the worktree is removed, because it is
merged later, or because it is the trace of a work that failed or was rejected
(see "Branches").

### Calls at the same time

A query and a handler can run git at the same time. When two calls update the
refs of the remote at the same time, git fails one with "cannot lock ref". So
the calls that change or read the remote refs (fetch, push, delete a branch) run
one at a time, in the order of the calls. A failure of one call does not block
the next one.

`readFileOnBranch` treats a branch that was deleted in the meantime as a missing
file, such as a branch deleted by an archive while the works are listed.
