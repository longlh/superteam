# ADR 16. An error of the engine is retried, an error of an agent is final

- Status: Accepted

## Context

A work can fail in two ways. An agent fails: its process fails, it runs too
long, or its result is not valid. Or a step of the engine fails: a push, a call
to the forge, or a merge that GitHub refuses. The engine loop retried a failed
event only for a few seconds, then put it in the DLQ, and the work was stuck
with no visible reason. Failing the work there would throw away the results of
its agents, for an error that is often a short outage of the network.

## Decision

- An error of an agent fails its task and its work, as before (see ADR 11). It
  is final, because running the agent again costs money and may not do better.
  Its `errorCause` is `agent`.
- An error of the engine is retried by the engine loop, for about one minute.
  When the event still fails, it goes to the DLQ, and the work keeps its status,
  with the error, `errorCause` `engine` and `retryable` true. The client retries
  it with `POST /works/{id}/retry`, which puts the event back in the queue.
- An error of the engine that cannot pass with a retry, such as a workflow that
  is no longer valid, fails the work, with `errorCause` `engine` and `retryable`
  false.

## Consequences

- A short outage of the network costs no run of an agent.
- A merge that GitHub refuses, such as for a missing review, is retried once the
  person has fixed it on GitHub.
- While the engine loop waits for a retry, the queue waits too, for up to about
  one minute (see `risks-and-debts.md`).
