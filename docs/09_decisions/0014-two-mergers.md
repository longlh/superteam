# ADR 14. The merger is split into the task merger and the work merger

- Status: Accepted
- Supersedes: ADR 6

## Context

The merger had two jobs. It merged the dependencies of a task, which is only
technical, and it merged the final tasks into the work, which also checks the
work against its DOD. One agent file had to switch its instructions on the job.

## Decision

- There are two roles of the engine for the merges: the task merger, which
  merges the dependencies of a task, and the work merger, which merges the final
  tasks into the work and fills the DOD checklist of the work.
- They are roles of the engine, so their agent files come with the plugin. The
  Seed Skill does not create them.
- The end of each one is its own event: `task-merger:ended` and
  `work-merger:ended`.

## Consequences

- Each role has its own instructions, tools and model.
- The project defines only the roles of the workers.
- The failure of a merger is handled like the failure of a worker.
