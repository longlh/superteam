# ADR 8. The pid file holds the pid and its job

- Status: Accepted

## Context

After a crash, `recover()` must kill the processes that are left and return
their jobs, and a pid alone does not say which job it was.

## Decision

The agent manager records the pid of an agent, with its job, in
`.superteam/.r/agents/{pid}.pid`. When the agent ends, it calls `onEnded` first
and then deletes the file.

## Consequences

- A crash between the two makes `recover()` return a job that has ended. Its
  handler ignores it, because it checks that the step is not done yet.
- The next `recover()` returns the jobs of the agents that were killed by
  `stopAll()`, because their files stay.
