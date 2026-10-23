---
name: work
description:
  Use when the user wants to see the state of one work of superteam, by its id.
argument-hint: <id>
---

# Show a work

The id of the work is: $ARGUMENTS. If it is empty, ask for it, or offer to list
the works with `/superteam:works`.

Call the MCP tool `get_work` of superteam with the id.

Show its title, `status`, `approvalStatus`, the URL of its pull request when it
has one, and its `error` when it has one. With an error:

- When `errorCause` is `agent`, say that an agent failed, and that the work is
  final: to try again, a new work is assigned.
- When `errorCause` is `engine` and `retryable` is true, say that a step of the
  engine failed, and that the work can be retried with the tool `retry_work`
  once the cause is fixed. Do not retry it without the agreement of the user.
- When `errorCause` is `engine` and `retryable` is false, say that a step of the
  engine failed for good.

If the tool answers an error, report it as it is.
