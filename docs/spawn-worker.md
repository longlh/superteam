# Spawn worker

How a worker is spawned to run a task. The root branch is the branch of the root workspace, where the engine runs.

## Steps

1. The engine creates a new git worktree for the task, on a new branch made from the root branch.
2. The engine spawns the merge agent to merge the branches of the nearest previous tasks in the dependency chain into the new branch. With a single previous task the merge is only a fast-forward. A conflict can happen only when the task joins the branches of more than one previous task.
   - The merge agent resolves the conflict itself, so the worker starts on a clean worktree.3. The engine spawns the worker process in the folder of the new worktree.
4. The worker runs the task and commits its changes to the new branch. The branch is local only: nothing is pushed to the remote.

## Merging into the root branch

The changes are not merged into the root branch when the worker finishes. They are merged when the approval status of the work becomes `APPROVED` (see "Approval flow" in the README). The merge agent merges the branches of all the final tasks of the work, the tasks at the end of the dependency chain, into the root branch. There can be more than one such branch.
