# Control Skill

It starts and stops the process of superteam in a workspace.

## Component

- `/superteam:start` starts the process of superteam in the background, detached
  from the session of the AI tool, so the process goes on when the session ends.
  It writes the pid of the process in `.superteam/.r/superteam.pid`.
- It refuses to start a second process while that pid is alive, because one
  engine runs for a workspace. It also refuses to start when `SUPERTEAM_PORT` is
  missing in `.superteam/.env`.
- `/superteam:stop` sends `SIGTERM` to that pid, and the process shuts down (see
  "Shutdown" in `orchestrator.md`).
