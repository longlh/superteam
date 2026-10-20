# ADR 3. The engine loop processes one event at a time

- Status: Accepted

## Context

Every change of a work is an event, and the events come from different callers
at the same time. A step such as the pull request must not be done twice.

## Decision

All the events go into a single queue, and the engine loop processes them one at
a time, in order, for all the works (see `engineloop.md`).

## Consequences

- There is no race condition between two events, and two events never change the
  state at the same time.
- A handler does not wait for a long job, and it can be done again, because the
  queue gives an event at least once (see `handlers.md`).
- A handler that works slowly makes all the works wait. This is a known issue
  that is accepted, because the loop is made for an internal tool (see
  `risks-and-debts.md`).
