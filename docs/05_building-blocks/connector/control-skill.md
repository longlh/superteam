# Control Skill

It starts and stops the process of superteam in a workspace.

## Component

- `/superteam:start` starts the process of superteam in the background, detached
  from the session of the AI tool, so the process goes on when the session ends.
  It writes the pid of the process in `.superteam/.r/superteam.pid`.
- It refuses to start a second process, because one engine runs for a workspace:
  when the pid of the pid file answers `GET /ready` (see "HTTP API" in
  `orchestrator.md`), or still runs `main.js`. A pid file whose pid runs another
  command is stale, because a pid can be reused, and it is removed. It also
  refuses to start when `SUPERTEAM_PORT` is missing in `.superteam/.env`.
- After it starts the process, it waits until `GET /ready` answers, up to 60
  seconds. When the process exits before, it fails with the last lines of
  `.superteam/.r/superteam.log`, such as for a missing origin or a port in use.
  When the time is up, it fails and says to read the log.
- `/superteam:stop` sends `SIGTERM` to that pid, and the process shuts down (see
  "Shutdown" in `orchestrator.md`). It sends it only when the pid still runs
  `main.js`, because a pid can be reused. Otherwise the pid file is stale, and
  it is removed.
