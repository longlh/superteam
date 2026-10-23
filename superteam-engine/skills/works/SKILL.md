---
name: works
description:
  Use when the user wants to see the works of superteam in the current
  workspace, with their ids, titles and status.
---

# List the works

Call the MCP tool `list_works` of superteam.

Show the works as a table, one row each: the id, the title, the `status`, the
`approvalStatus`, and the URL of the pull request when the work has one. When
there is no work, say so.

If the tool answers an error, report it as it is. It says how to fix it, such as
to run `/superteam:start`.
