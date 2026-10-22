# Agent manager

It spawns the process of an agent, watches it, and kills it. The agent is the
worker of a task, or the merger (see `agents.md`).

## Component

The agent manager owns the whole life of an agent process: it starts it, decides
when its run has ended, and kills it. No other part touches an agent process.
When an agent ends, the agent manager calls the `onEnded` callback of its job.

## Code

- Spawn: The agent manager spawns the agent process in the folder of the
  worktree of the job. It first reads the pid files: if an agent of the same job
  already runs, it does not spawn another one.
- Watch: The agent manager records the pid of the agent process, with its job,
  in `.superteam/.r/agents/{pid}.pid`, and watches it. When the agent ends, it
  calls `onEnded` first, then deletes the file. A crash between the two makes
  `recover()` return a job that has ended, which its handler ignores because it
  checks that the step is not done yet. If the agent runs longer than the
  maximum time, 12 hours by default and configurable, the agent manager kills
  it.
- Kill: The process runs as a process group of its own, so the agent manager can
  kill all of it. `stopWork()` kills the agents of a work at once, to save the
  cost.
- Recover: `recover()` handles a crash. For each pid in
  `.superteam/.r/agents/{pid}.pid`, it kills the process if it is alive, and
  returns the job of its agent. An agent that runs without its agent manager
  would be stalled, because nothing watches it. It handles a crash and a
  shutdown in the same way.
- Shutdown: `stopAll()` kills the agents that are running at once. The pids of
  the killed agents stay in their files, so the next `recover()` returns their
  jobs.
