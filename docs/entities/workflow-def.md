# Entity: WorkflowDef

Status: draft v0 (to be improved).

A WorkflowDef is a named definition, e.g. "workflow tiếp nhận yêu cầu". It is a trigger that creates tasks and assigns them automatically, made of an array of entries.

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `id` | auto_id | no | engine-level | |
| `name` | string | no | project-level | name of the definition, e.g. "workflow tiếp nhận yêu cầu" |
| `entries` | [entry] | no | engine-level | see below |

Each entry:

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `trigger` | enum | | project-level | |
| `input` | | | engine-level | |
| `output` | | | engine-level | |
| `assignTo` | ref to role | | engine-level | |

Adapter: generates the Claude Code workflow from the WorkflowDef entity, at the location Claude Code expects by convention (build step, like Role).
