# Spawn worker

How a worker is spawned to run a task. The root branch is the branch of the root
workspace, where the engine runs.

## Worktrees

A worktree is the environment where a job is done. There are two kinds, one for
each unit of the work. The merger creates both.

|          | Worktree of a work                                                      | Worktree of a task                                                                                                                                         |
| -------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Based on | The root branch.                                                        | The branch of the task it depends on. A task with no dependency is based on the root branch. A task with more than one dependency is based on one of them. |
| Branch   | `works/{work_id}`                                                       | `tasks/{work_id}/{task_id}`                                                                                                                                |
| Folder   | `.superteam/.r/worktrees/works/{work_id}`                               | `.superteam/.r/worktrees/tasks/{work_id}/{task_id}`                                                                                                        |
| Created  | When the work is assigned.                                              | When the task starts.                                                                                                                                      |
| Removed  | After the pull request is opened.                                       | When the task ends.                                                                                                                                        |
| Used for | The merger writes the work, and merges the branches of the final tasks. | The job of the task, by a worker, a person or an AI.                                                                                                       |

The folders of the worktrees are runtime data, so they are under
`.superteam/.r`. The folder of a task is not inside the folder of its work: a
folder inside a worktree would show up there as an untracked file.

The branch of a worktree is kept after the worktree is removed, because it is
merged later. All the branches of a work, its own and the branches of its tasks,
are deleted when the work ends.

## The merger

The merger is spawned when the work is assigned, and it is responsible for the
whole unit of the work. It creates the worktree of the work, and writes the work
in it. Then it creates the worktree of each task, as the steps below show, and
it does all the merges of the work.

## Steps

The steps of one task:

1. The merger creates a new git worktree for the task, on a new branch (see
   "Worktrees").
2. If the task depends on more than one task, the merger merges the branches of
   the other dependencies into the new branch. A conflict can happen only here.
   - The merger resolves the conflict itself, so the worker starts on a clean
     worktree.
3. The engine spawns the worker process in the folder of the new worktree.
4. The engine records the pid of the worker process in
   `.superteam/.r/workers/{pid}.pid`, and watches it. If the worker runs longer
   than the maximum time, 12 hours by default and configurable, the engine kills
   it.
5. The worker runs the task and commits its changes to the new branch. It only
   works in the worktree and on the branch that the merger prepared for it. The
   branch is kept on the remote, where the results are stored.
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
the work is `PROPOSED`, the merger merges the branches of all the final tasks of
the work, the tasks at the end of the dependency chain, into the branch of the
work, in the worktree of the work. There can be more than one such branch, so
this merge is needed. The engine pushes the branch of the work and opens a pull
request.

The approver reviews the work in the pull request, and the decision goes through
the API of the engine (see "Work flow" in `engine.md`). When the work is
approved, the engine merges the pull request into the root branch. When it is
rejected, the engine closes the pull request. In both cases the engine deletes
all the branches of the work: its own branch and the branches of its tasks.

## Help with code

What code can do is not left to the worker. There are two ways to give it that
help, and both are kept open:

- A standalone script that the worker runs, such as the creation of an artifact
  (see "Artifacts" in `storage.md`). It needs no engine: it works on the files
  and on git in the worktree.
- A stateless API of the engine, which only computes for the worker. It keeps no
  state, and the worker calls it over HTTP. There is no use case for it yet.
