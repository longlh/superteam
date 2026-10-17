# Spawn worker

How a worker is spawned to run a task. The root branch is the branch of the root
workspace, where the engine runs.

## Steps

1. The engine creates a new git worktree for the task, on a new branch made from
   the root branch.
2. The engine spawns the merge agent to merge the branches of the nearest
   previous tasks in the dependency chain into the new branch. With a single
   previous task the merge is only a fast-forward. A conflict can happen only
   when the task joins the branches of more than one previous task.
   - The merge agent resolves the conflict itself, so the worker starts on a
     clean worktree.
3. The engine spawns the worker process in the folder of the new worktree.
4. The engine records the pid of the worker process in
   `.superteam/.r/workers/{pid}.pid`, and watches it. If the worker runs longer
   than the maximum time, 12 hours by default and configurable, the engine kills
   it.
5. The worker runs the task and commits its changes to the new branch. It only
   works in the worktree and on the branch that the engine prepared for it. The
   branch of a task is local only. Only the branch of the work is pushed (see
   below).
6. The engine removes the worktree. The branch is kept, because it is merged
   later.

## Worker command

In step 3, the engine runs the worker as a `claude` process, in the folder of
the worktree:

```
claude -p '<prompt>' --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>
```

- The prompt is made of the instructions of the role, the `instructions` of the
  task, the content of its work, and the artifacts of the tasks it depends on.
- The process runs with the agent of the role (`.claude/agents/{role}.md`), and
  the tools of the role are allowed. Its stdin is `/dev/null`.
- The result is validated against the JSON schema, and it is in the
  `structured_output` field of the JSON output. This is how the worker returns
  its result to the engine.
- The process inherits the environment and signs in with the user's own account,
  so it needs no API key.
- The process runs as a process group of its own, so the engine can kill all of
  it (see step 4).

## Merging into the root branch

The changes are not merged into the root branch when the worker finishes. When
the work is `PROPOSED`, the merge agent merges the branches of all the final
tasks of the work, the tasks at the end of the dependency chain, into one branch
of the work. There can be more than one such branch, so this merge is needed.
The engine pushes the branch of the work and opens a pull request on GitHub, the
only forge that is supported for now. The branches of the tasks stay local.

The approver reviews the work in the pull request, and the decision goes through
the API of the engine (see "Work flow" in `engine.md`). When the work is
approved, the engine merges the pull request into the root branch. When it is
rejected, the engine closes the pull request and keeps the branch.
