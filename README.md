# Superteam

A Claude Code plugin that runs a team of agents on any project's own workflow.

## Problem

In teamwork, the team lead has to:

- split the job into smaller pieces and give them to the members of the team,
  based on what each one can do (their role);
- coordinate the pieces, so that the final result comes back after a chain of
  activities that depend on each other through a chain of inputs and outputs.

When the work does not flow, it is usually because:

- the team lead does not coordinate the work according to the workflow;
- the tasks run in the wrong order, or without enough input.

## Solution

Build an **engine** that replaces the team lead. The engine:

- coordinates the work according to the workflow: it breaks the work down into
  tasks and assigns them;
- records the results and keeps the statuses correct;
- triggers each task at the right time: only when it is its turn and it has
  enough input, so the tasks run in the right order;
- tracks the work and summarizes its results.

## Install and update

Install the plugin in Claude Code, from its marketplace on GitHub:

```
/plugin install superteam --marketplace longlh/superteam
```

Then set up a project with `/superteam:def-role` and `/superteam:def-process`,
and start superteam with `/superteam:start`.

To update the plugin:

1. Run `/superteam:stop` in each project where superteam runs.
2. Update the marketplace, then the plugin:
   `/plugin marketplace update superteam`, then
   `claude plugin update superteam@superteam`.
3. Restart the session of Claude Code, so that it loads the new skills and the
   new MCP server.
4. Run `/superteam:start` again, so that superteam runs the new code.

## Appendix

The meaning of the terms used above.

### Workflow

The way a job is split follows a predefined procedure that belongs to the nature
of that job. This procedure is called a **workflow**: workflow A is the teamwork
activity that does job A.

For a kind of job, the workflow provides:

- how many steps the job has;
- the role each step needs;
- how the steps depend on each other;
- the DOD template of each step;
- the DOD template of the job;
- which roles can be the approver.

The team lead uses the workflow as the framework to coordinate a work, the unit
of job given to the team (see "Work and task").

#### Role

A **role** represents a set of capabilities and responsibilities to do work.

- The team lead gives out the work based on roles.
- A role is not a member: it describes what is needed to do a job, not who does
  it.

#### DOD

A job is done when it meets its **DOD** (definition of done). Both a work and a
task have one (see "Work and task").

- The DOD templates are in the workflow: one for the kind of job (the work) and
  one for each step (the task). They can be customized for each work or task.
- The team lead uses the DOD of the work to create the DOD of its tasks.

#### Work and task

- A **work** is the unit of job given to the team.
- A **task** is the unit of job given to a member.
- A work is a list of tasks. They are executed in an order that depends on their
  inputs and outputs: a task starts when it has the outputs of the tasks it
  depends on.

##### Status

The status of a work or a task only shows which step it is at. It does not show
the result of the job (see "Output"). The approval of a work is tracked
separately (see "Approval flow").

Work:

| Status        | Meaning                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `OPEN`        | The team lead has not taken the work yet, so it has not been coordinated.              |
| `IN_PROGRESS` | Set automatically once its tasks have been created (the team lead has coordinated it). |
| `DONE`        | Set automatically when all the tasks of the work are done.                             |

Task:

| Status        | Meaning                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING`     | The task has appeared in the work, but it is not ready to start yet (no one assigned, missing input...).                            |
| `IN_PROGRESS` | Set automatically when the task is ready to start: it is assigned, and it has its input from the output of the tasks it depends on. |
| `DONE`        | Set by the person doing the task, together with the DOD checklist of the task.                                                      |

##### Output

The result of a job is its output, made of:

- **artifacts**: the products a task can create while it is `IN_PROGRESS`;
- the **DOD checklist**: the completion report of a task, based on the DOD of
  that task.

The output of a work is all the artifacts and all the DOD checklists of the
tasks in it.

The approval flow adds one more artifact to the work: the reason for the
decision of the approver (see "Approval result").

### Approval flow

The approval flow happens when the workflow ends. An **approver** evaluates the
whole output of the work, then either approves or rejects it. The workflow says
which roles can be the approver.

The approver decides in the pull request of the work on GitHub, by merging or
closing it, or with `/superteam:decide`.

Normally an approval flow is independent from the workflow and has many steps of
its own. It is not the main target of the engine, so it is kept simple here.

#### Approval status

A work has an `approval_status`, separate from its status:

| Approval status | Meaning                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `DRAFT`         | The default when the work is created.                                                                     |
| `PROPOSED`      | Set automatically when the status of the work becomes `DONE`. The work is then submitted to the approver. |
| `APPROVED`      | Decided by the approver.                                                                                  |
| `REJECTED`      | Decided by the approver.                                                                                  |

#### Approval result

The result of the approval flow is the decision (`APPROVED` or `REJECTED`) and
an **artifact** that records the reason for the decision. The approver creates
this artifact for the work, together with the decision.
