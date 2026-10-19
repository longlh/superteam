# Persistence data

`.superteam/.p/` holds the data that must be kept in git: so that people can
work across devices, and so that the history of the work is kept. The unit of
the history is the work.

## Component

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

## Code

### The id of an artifact

The `id` is a hash (SHA-256, hex) of the `work_id`, the `task_id`, the
`createdAt` and the `index` of the artifact. The `index` is its position among
the artifacts that a task creates at once. There is no counter to share, because
the tasks run in parallel.
