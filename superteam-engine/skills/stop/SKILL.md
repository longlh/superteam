---
name: stop
description:
  Use when the user wants to stop superteam, the background process that runs
  the team of agents, in the current workspace.
---

# Stop superteam

Run this from the root of the workspace (the project folder, not a worktree):

```
node ${CLAUDE_PLUGIN_ROOT}/src/scripts/stop.js
```

Report its output to the user: `superteam stopped`, or
`superteam was not running`, with the number of the agents that a crash left and
that it killed, when there are any. If it fails, report the error message.
