# ADR 11. A work lives on its branch, not in the runtime storage

- Status: Accepted
- Supersedes: ADR 2

## Context

A worker can fail: its process fails, it is killed because it runs too long, or
its result does not match the schema. The other jobs of the work keep costing
money. ADR 2 kept a record of a failed or rejected work in the runtime storage,
so that `GET /works` lists it. But the engine can read the work in the worktree
of the work, and the runtime storage is not shared across devices.

## Decision

- A task is not run again. When a worker or the merger fails, the whole work
  fails, the tasks that have not started never start, and the engine asks the
  job runner to stop the other jobs of the work at once. A rejected work is
  final too. To try again, a new work is assigned.
- There is no record of a work in the runtime storage. The engine writes the
  work in `.superteam/.p/works/{id}.json` of the worktree of the work, when it
  prepares the worktree, and commits it on the branch of the work.
- The tasks of a work are in the runtime of the worktree of the work, so they
  are never merged, and they are removed with the worktree.
- When the work fails, the engine writes its `error` in the work, commits it,
  and pushes the branch of the work. When the work is rejected, the branch of
  the work is kept. In both cases, the branches of the tasks are deleted.

## Consequences

- The cost is saved, and there is no state to resume.
- A failed task is recorded as `completed` with an `error`, and a failed work
  has an `error`, so both are `FAILED` (see `storage.md`).
- `GET /works` lists a failed or rejected work from its branch on the remote, on
  every machine (see `http-api.md`).
- The branches of the failed and rejected works pile up on the remote, until a
  client archives them (see "Archive a work" in `http-api.md`).
