# Entity: Task

Status: draft v0 (to be improved).

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `id` | auto_id | no | engine-level | |
| `type` | enum | no | project-level | task type; values are defined at project level. WorkflowDefs act on task types, not on individual tasks |
| `status` | enum | no | engine-level | `open` \| `in_progress` \| `wait_for_approval` \| `approved` \| `rejected` |
| `assignee` | ref to role | yes | engine-level | a role, not an agent |
| `createdAt` | timestamp | no | engine-level | |
| `createdBy` | ref to role | no | engine-level | |
| `updatedAt` | timestamp | yes | engine-level | |
| `updatedBy` | ref to role | yes | engine-level | |
| `approvedAt` | timestamp | yes | engine-level | |
| `approvedBy` | ref to role | yes | engine-level | |
| `rejectedAt` | timestamp | yes | engine-level | |
| `rejectedBy` | ref to role | yes | engine-level | |
| `title` | string | no | engine-level | |
| `description` | string | no | engine-level | |
| `parent` | ref to task | yes | engine-level | root tasks have no parent |
| `dependOn` | [ref to task] | no | engine-level | list, may be empty |
| `archived` | bool | no | engine-level | |

`status` has no transition constraints for now (any value can change to any other).
