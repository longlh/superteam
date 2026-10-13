# Entity: Artifact

Status: draft v0 (to be improved).

| Field | Type | Nullable | Level | Notes |
| --- | --- | --- | --- | --- |
| `id` | auto_id | no | engine-level | |
| `task` | ref to task | no | engine-level | |
| `version` | auto_increment_int | no | engine-level | separate counter per task (scoped by task id); human-readable form is `task-<task id>-artifact-<version>`, e.g. `task-1-artifact-1`, `task-1-artifact-2` |
| `createdAt` | timestamp | no | engine-level | |
| `source` | path/to/file | no | engine-level | |
