# ADR 18. The branches of superteam have a prefix that the project sets

- Status: Accepted

## Context

The branches of a work and of its tasks were `works/{id}` and
`tasks/{id}/{task}`. A project can have branches of its own with these names,
and the engine then reads them as works, or refuses an id. Git also refuses
`works/x` when a branch named `works` exists, and the same for a prefix such as
`superteam/` when the project has a branch named `superteam`.

## Decision

- The branch of a work is `{prefix}-work/{id}`, and the branch of a task is
  `{prefix}-task/{id}/{task}`. The prefix is `superteam` by default.
- A project can set its own prefix in `.superteam/.p/config.json`, as
  `{ "branchPrefix": "..." }`, a slug. The file is committed and pushed like the
  workflows, so the whole team uses the same prefix.
- The engine reads the file from the upstream of the root branch when it starts.
  A change of the prefix needs a restart.

## Consequences

- The branches of superteam do not mix with the branches of the project, and
  they are easy to see on GitHub.
- The works of another prefix are not seen: a work made before a change of the
  prefix, or before this decision, is no longer listed or queried.
- A config file that is not valid stops the start, with the reason.
