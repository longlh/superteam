# ADR 6. The merger is a role of the engine

- Status: Accepted

## Context

There are two kinds of job: the jobs that the engine understands (the assigner,
the approver and the merger) and the jobs of the project (see
`solution-strategy.md`). The merger needs an agent file to run as an AI agent.

## Decision

The merger is a role of the engine, so its agent file comes with the plugin. The
Seed Skill does not create it.

## Consequences

- The project defines only the roles of the workers.
- The failure of the merger is handled like the failure of a worker.
