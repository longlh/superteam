# ADR 19. A workflow can repeat a group of steps until a gate passes

- Status: Accepted

## Context

A development process often repeats a few steps until a reviewer is satisfied:
test, fix the bugs, verify, and again, until no bug is left, or until the team
stops and releases with known limitations. A workflow was a fixed graph in which
each step runs once, so it could not express this.

## Decision

- A step of a workflow can be a loop group:
  `{ name, dependOn, loop: { maxRounds, steps } }`. Its steps are a straight
  chain, and at least one of them is a gate (`"gate": true`), whose DOD is the
  test of the round.
- When the work is assigned, the group is unrolled into one task for each step
  and each round, `{group}-{step}-{round}`, chained round after round. The graph
  stays static, and every task runs at most once (ADR 11).
- A gate passes when every item of its DOD checklist is true. Once a gate has
  passed, the next tasks of the group are skipped: they are done with no agent
  and no branch, and a skipped task stands for the task that ran before it.
- The first task of a round gets the issues of the gates of the round before.
- When the last round ends with no gate passed, the work is not failed: it goes
  on with limitations, the issues of the gates of the last round. They are
  written in the work, shown in the pull request and in the API, and given to
  the steps after the group and to the work merger.

## Consequences

- A process of test and fix is a workflow of its own, with a limit that the
  project sets.
- The rounds that are not needed cost nothing.
- An approver can approve a work that has limitations, and sees them.
- A loop inside a loop, and a limit by time, are not supported (see
  `risks-and-debts.md`).
