# Agent manager

It spawns the process of an agent, watches it, and kills it. The agent is the
worker of a task, the task merger or the work merger (see `agents.md`).

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
  `timeout` of its job, the agent manager kills it. The error of a failed agent
  keeps the end of its stderr, and the `result` text of an output with
  `is_error`.
- Kill: The process runs as a process group of its own, so the agent manager can
  kill all of it. `stopWork()` kills the agents of a work at once, to save the
  cost.
- Recover: `recover()` handles a crash. For each pid in
  `.superteam/.r/agents/{pid}.pid`, it kills the process if it is alive and its
  command is still the command of the agents, because a pid can be reused. It
  returns the job of its agent. An agent that runs without its agent manager
  would be stalled, because nothing watches it. It handles a crash and a
  shutdown in the same way.
- Clean up: `killLeftovers()` kills, like `recover()`, the agents of the pid
  files whose process is alive and still runs the command of the agents, but it
  keeps the files, so the next `recover()` returns their jobs and the engine
  fails their tasks. It returns how many agents it killed. `/superteam:stop`
  uses it when superteam is not running (see `control-skill.md`).
- Shutdown: `stopAll()` kills the agents that are running at once. It waits for
  the end of an agent that is being given to its callback, so that the end of an
  agent that has already exited is not lost. The pids of the killed agents stay
  in their files, so the next `recover()` returns their jobs.
