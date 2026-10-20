# Persistence data

`.superteam/.p/` holds the data that must be kept in git: so that people can
work across devices, and so that the history of the work is kept. The unit of
the history is the work.

## Component

Persistence data has two groups.

### Initial data

The data that is there before the engine runs a work. The Seed Skill helps to
write it.

| Entity   | Path                                  |
| -------- | ------------------------------------- |
| Workflow | `.superteam/.p/workflows/{name}.json` |

### Operation data

The data that is created by the operation of the engine. The engine does not
create it directly. It is created in a worktree and kept on its branch, and it
reaches the root branch when the engine merges the pull request of the work, in
the approve activity. So the root branch never has a persistence file that is
not committed, and pulling the merged pull request causes no conflict. What is
written in a worktree does not go through the engine loop.

| Entity   | Path                                          |
| -------- | --------------------------------------------- |
| Work     | `.superteam/.p/works/{id}.json`               |
| Artifact | `.superteam/.p/artifacts/{work_id}/{id}.json` |

#### Artifacts

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
