# Event loop

How the engine processes its queue. The engine is the only writer of the state (see "Engine" in the architecture).

## Queue

- Every write is an event, a write command, that goes into a single queue. This includes the writes from different AI sessions at the same time.
- A write is accepted into the queue and the caller does not wait for it to be processed.

## Loop

The loop claims the events from the queue and processes them one at a time, in order, so there is no race condition.

For each event, the engine:

1. Applies the write to the state.
2. Derives the statuses from the new state (see "Derived status" in the data structure).
3. Reacts to what the change makes ready:
   - A task that has just become `IN_PROGRESS` (all the tasks it depends on are completed): the engine spawns a worker for it (see "Spawn worker").
   - A work whose approval status has just become `APPROVED`: the engine spawns the merge agent to merge its branches into the root branch.

## Workers

- Tasks that do not depend on each other are `IN_PROGRESS` at the same time, so their workers run in parallel.
- The loop does not wait for a worker. A worker can run for hours, and waiting would block every other event.
- When a worker finishes, its result comes back to the engine as a new event in the queue, like any other write. The loop processes it in order: it records the output of the task and marks the task completed, which may make other tasks ready.
