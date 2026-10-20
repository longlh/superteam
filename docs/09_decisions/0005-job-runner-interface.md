# ADR 5. The engine defines the job runner as an interface

- Status: Accepted

## Context

The engine must not know who does a job, so that a person and an AI are
interchangeable.

## Decision

The engine does not run the jobs itself. It defines a job runner as an interface
(`run`, `stopWork`, `stopAll`, `recover`), and it is given one when it is
created. The engine starts a job and waits for its result, so the result comes
back by a callback (`onEnded`).

## Consequences

- The other side does not need an interface to call the engine.
- The engine enqueues an event when a job ends.
- The names and the fields of the interface are still a proposal (see
  `risks-and-debts.md`).
