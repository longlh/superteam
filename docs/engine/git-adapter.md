# Git adapter

The way the engine reaches git and the forge.

## Component

The engine does not keep a store for the results or for the approvals. Git is
the platform, and each part of it has a job:

| Git                       | Job                                                        |
| ------------------------- | ---------------------------------------------------------- |
| Worktree                  | An environment of its own for each worker.                 |
| Remote branch             | Where the results are kept.                                |
| Pull request              | The way a work is approved: the approver reviews it there. |
| Merge of the pull request | The way a result is recorded, as rebase and squash.        |

The engine reaches git and the forge through a git adapter, so that another
forge can be added later. For now only GitHub is supported, and the adapter
needs the `gh` command line.

### Branches

The branches of a work (its own branch and the branches of its tasks) are
deleted when the work ends, so that they do not pile up as garbage.
