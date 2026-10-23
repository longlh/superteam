---
name: start
description:
  Use when the user wants to start superteam, the background process that runs
  the team of agents, in the current workspace.
---

# Start superteam

Run this from the root of the workspace (the project folder, not a worktree):

```
node ${CLAUDE_PLUGIN_ROOT}/src/scripts/start.js
```

Report its output to the user. It waits until superteam answers on its port,
then prints the pid, the port and the log path.

If it fails, report the error message. When the process exits during its start,
the message holds the last lines of `.superteam/.r/superteam.log`.

`SUPERTEAM_PORT` must be set in `.superteam/.env`. It is seeded by
`/superteam:def-role` or `/superteam:def-process`. If it is missing, tell the
user to run one of them first.
