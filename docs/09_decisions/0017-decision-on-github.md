# ADR 17. A decision can be made on GitHub

- Status: Accepted

## Context

The approver reviews a work in its pull request on GitHub, and the habit there
is to press Merge or Close. The engine did its cleanup only for a decision sent
to the API: after a merge or a close on GitHub, the branches of the tasks were
left, and a decision sent after it was refused, because the work was no longer
`PROPOSED`.

## Decision

- A merge or a close of the pull request on GitHub is a decision, like one sent
  to the API: the merge approves the work, and the close rejects it (see ADR 1).
- The engine finds such a decision when it reads the work, for a query or a
  list, and at the start, in the reconcile. When the pull request is merged or
  closed and branches that the decision deletes are left, it enqueues
  `work:decide` with that decision, and the handler finishes the cleanup.

## Consequences

- The approver can decide on GitHub or with the API: the result is the same.
- The cleanup of a decision made on GitHub waits for the next query or the next
  start. A check at a fixed interval, or a webhook of GitHub, could do it at
  once (see `risks-and-debts.md`).
- A merge on GitHub should be a squash merge, as the one of the engine (see
  `deployment.md`).
