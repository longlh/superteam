# ADR 1. The approval is the merge of the pull request

- Status: Accepted

## Context

The engine does not create persistence data directly, and a decision that is
stored needs one more update after it.

## Decision

The approver reviews a work in its pull request and sends the decision to the
API. When the work is approved, the engine merges the pull request into the root
branch, and this merge is the approval. The decision itself is not stored. When
the work is rejected, the engine closes the pull request.

## Consequences

- Approving is one atomic action, with nothing else to update, and the git
  history keeps it.
- The work and the engine stay clean.
- The approval status of a work is derived from the state of its pull request
  (see `storage.md`).
