# Agent manager

It spawns the process of a worker, watches it, and kills it. It does the same
for the merger (see `agents.md`).

## Component

The agent manager owns the whole life of a worker process: it starts it, decides
when its run has ended, and kills it. No other part touches a worker process.
Everything that needs to act on a worker goes through the agent manager: a
handler asks it, and a client cannot start or stop a worker. When a worker ends,
the agent manager enqueues an event.

## Code

- Spawn: The engine spawns the worker process in the folder of the new worktree.
- Watch: The engine records the pid of the worker process in
  `.superteam/.r/workers/{pid}.pid`, and watches it. If the worker runs longer
  than the maximum time, 12 hours by default and configurable, the engine kills
  it.
- Kill: The process runs as a process group of its own, so the engine can kill
  all of it (see "Watch").
