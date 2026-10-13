# Entity: WorkflowExec

Status: draft v0 (to be improved).

A record written each time a WorkflowDef entry is triggered (one execution): what triggered it, which tasks it created, and the outcome.

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `id` | auto_id | no | engine-level | |
| `workflowDef` | ref to WorkflowDef | no | engine-level | the WorkflowDef that ran |
| `triggeredBy` | ref to task | yes | engine-level | task whose event fired the trigger; null if started manually |
| `triggeredAt` | timestamp | no | engine-level | |
| `createdTasks` | [ref to task] | no | engine-level | tasks created by this execution |
| `result` | enum | no | engine-level | `succeeded` \| `failed` |
| `error` | string | yes | engine-level | reason when `result` is `failed` |
