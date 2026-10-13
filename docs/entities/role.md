# Entity: Role

Status: draft v0 (to be improved).

Roles are defined by each project, following this schema. The engine reads them through an adapter; the schema is independent of the Claude Code subagent format.

Adapter: combines the role record with its `instructions` file to generate one markdown agent definition, written at the location Claude Code expects by convention. It runs as a build step, triggered manually, after the project has set up its role entities.

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `id` | string | no | engine-level | stable name; referenced by Task (`assignee`, `createdBy`, `approvedBy`, ...) |
| `description` | string | no | engine-level | what the role is responsible for |
| `kind` | enum | no | engine-level | `ai` \| `human` |
| `instructions` | path/to/file | yes | engine-level | file describing how the role works |
| `tools` | [string] | yes | engine-level | tools the role may use |
| `model` | string | yes | engine-level | suggested model |
| `approver` | ref to role | yes | engine-level | permission setup only: the role allowed to approve this role's tasks. Null does not mean auto-approve; approval flow is decided by the WorkflowDef |
