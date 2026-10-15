# Data structure

A field whose name starts with `*` is required.

```mermaid
erDiagram
    WORKFLOW {
        string *name PK "slug-like"
        string *title "human readable name"
        string description "human readable description"
        string[] dod
    }

    WORKFLOW_STEP {
        string *name PK
        string *workflow FK
        string[] dod
        string description
        string instruction
        string role
    }

    WORK {
        string *id PK
        string workflow FK
        string *title
        string description
        string[] dod
        datetime createdAt
        datetime updatedAt
        boolean[] dodChecklist
        boolean approved
        datetime approvalAt
    }

    TASK {
        string *id PK
        string work FK
        string *title
        string description
        string[] dod
        datetime createdAt
        datetime updatedAt
        string assignee
        string instruction
        taskId[] dependOn
        boolean[] dodChecklist
        boolean completed
        datetime completedAt
    }

    ARTIFACT {
        string *id PK
        string task FK
        string work FK
        datetime createdAt
        string *content
    }

    WORKFLOW ||--o{ WORKFLOW_STEP : has
    WORKFLOW ||--o{ WORK : follows
    WORK ||--o{ TASK : has
    TASK }o--o{ TASK : "depends on"
    TASK |o--o{ ARTIFACT : has
    WORK |o--o{ ARTIFACT : has
```

## Derived status

These statuses are not stored. They are derived from the fields of the entities.

### Task status

| Status | Formula |
|---|---|
| `PENDING` | `depend_tasks_not_completed.length > 0` |
| `IN_PROGRESS` | `depend_tasks_not_completed.length == 0 && !completed` |
| `DONE` | `completed` |

`depend_tasks_not_completed` is the tasks in `dependOn` that are not completed.

### Work status

| Status | Formula |
|---|---|
| `OPEN` | `tasks.length == 0` |
| `IN_PROGRESS` | `tasks.length > 0 && tasks.length > done_tasks.length` |
| `DONE` | `tasks.length > 0 && tasks.length === done_tasks.length` |

### Work approval status

The approval status of a work is derived from the fields of the work and its tasks.

| Approval status | Formula |
|---|---|
| `DRAFT` | `approved == false && tasks.length == 0` |
| `PROPOSED` | `tasks.length === done_tasks.length && tasks.length > 0` |
| `APPROVED` | `PROPOSED && approvalAt && approved` |
| `REJECTED` | `PROPOSED && approvalAt && !approved` |
