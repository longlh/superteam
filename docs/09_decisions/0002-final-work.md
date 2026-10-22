# ADR 2. A failed or rejected work is final

- Status: Superseded by ADR 11

## Context

A worker can fail: its process fails, it is killed because it runs too long, or
its result does not match the schema. The other jobs of the work keep costing
money.

## Decision

A task is not run again. When a worker or the merger fails, the whole work
fails, the tasks that have not started never start, and the engine asks the job
runner to stop the other jobs of the work at once. The engine removes the
worktrees of the work, deletes all its branches, and keeps its record in the
runtime storage. A rejected work is final too. To try again, a new work is
assigned.

## Consequences

- The cost is saved, and there is no state to resume.
- A failed task is recorded as `completed` with an `error`, so it is `FAILED`
  (see `storage.md`).
- The record of a failed work stays in the runtime storage, and `GET /works`
  lists it (see `http-api.md`).
