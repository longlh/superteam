# Risks and debts

The known limits that are accepted, and the questions that are not decided yet.
Each item comes from the document of the part that it is about.

## Known issues

### Deployment (`deployment.md`)

- superteam is tested well only on macOS. Running it on Windows is not
  recommended, because some parts are known not to work there:
  - A process is killed in the way of macOS and Linux. The Agents start an agent
    as a process group of its own, and kill the whole group with a negative pid
    (`process.kill(-pid, "SIGKILL")`, see `agent-manager.md`). Windows has no
    process groups: the kill fails, the error is taken as an agent that is
    already gone, and the agent and its children keep running.
  - The command of a process is read with `ps` (see `agent-manager.md`, and
    "Start" in `orchestrator.md`), which Windows does not have. A live agent, or
    a live superteam, then looks gone, so `/superteam:stop` does not stop
    superteam.
  - A path built by Node uses `\` there, so a part that gives a path to git can
    fail, as the read of a file on a branch did before it was fixed (see
    `git-adapter.md`).

### Engine loop (`engineloop.md`)

The loop is made for an internal tool. These limits are known and accepted:

- One event is processed at a time, for all the works. A handler does not wait
  for a long job, but its own steps, such as a git command or a request to the
  forge, are done one event at a time. A slow step, such as a push or a pull
  request, makes the other works wait for it. The queue is also blocked while
  the loop waits for a retry, for up to about one minute (see ADR 16).
- `order` has a maximum of `999999`. Creating an event above it throws: it is
  not supported.
- An error of the file system inside the loop is not caught (fail fast): the
  loop stops, and the next start recovers from the claim that is left.
- A handler that does not return, because it waits for something that never
  happens, stops the loop. There is no time limit for a handler.

### Engine (`engine.md`)

- `listWorks()` makes one call to the forge for each work, to read its pull
  request. A long list of works is slow.
- `reconcile(jobs)` can publish a job again when its own event,
  `engine:reconcile`, is retried. So an agent can run one more time.
- A failure of the remote in one work fails the event `engine:reconcile`, so it
  fails for all the works, not only for that one. When it goes to the DLQ, no
  work shows the error, because the event belongs to no work: only the log has
  it. The killed jobs of that start are not failed, and the jobs that the engine
  waits for are not published again, until the next start.
- `listWorks()` finds the approved works in the last 1000 merged pull requests
  of the repository, and keeps those of the branches `{prefix}-work/*`. In a
  busy repository, an old approved work is not listed, but its state can still
  be queried by its id.
- An approved work is read from the branch its pull request was merged on, else
  from the upstream of the root branch. When neither has its file, for example
  when that branch was deleted before it was merged on, the work is no longer
  listed and cannot be queried, but its id stays used.
- The ids of the assigns that are accepted and not processed yet are kept in
  memory. After a restart, while an assign left in the queue is not processed, a
  second assign with the same id is accepted, and the engine creates the work
  once, from the first one.
- A decision made on GitHub, a merge or a close of the pull request, is finished
  when the work is next read, or at the next start (see ADR 17). Until then the
  branches of its tasks are left. A check of the proposed works at a fixed
  interval, or a webhook of GitHub forwarded to this machine (such as with the
  `gh webhook forward` extension), could finish it at once.

### Workflows (`storage.md`)

- A loop group cannot hold another loop group, and its steps are a straight
  chain: two steps of a round cannot run side by side (see ADR 19).
- A loop group is limited by its number of rounds only, not by time.

### Handlers (`handlers.md`)

- If the engine stops between the opening of the pull request of a work and the
  removal of the worktree of the work, the event is processed again at the next
  start, and the worktree is removed. When that event goes to the DLQ instead,
  the worktree is left until the work is retried (see ADR 16). Reconcile does
  not remove it.

### Git adapter (`git-adapter.md`)

- The root branch is read from the root workspace when a work is assigned. A
  work is assigned on the branch that is checked out at that time, so a person
  who has switched to another branch by mistake assigns the work on it.
- On macOS, `/usr/bin/git` is a shim that runs `xcrun` first. It is slow when
  many git commands run at the same time, which slows the engine and its agents.
  The tests put the real git binary first in the `PATH`.

### Orchestrator (`orchestrator.md`)

- The start checks `gh` with `gh auth status`, which fails when any host that is
  configured in `gh` has a bad token, even when the token of GitHub is good. So
  the start is refused.
- The HTTP API has no authentication: it listens on 127.0.0.1 only, for the
  person who runs superteam on this machine. Another local process can call it.

### Agents (`agents.md`)

- The number of agents that run at once is not limited. Each task that is ready
  gets its agent at once, so a wide workflow, or several works, run many
  `claude` processes together, each with the MCP servers of its session, and
  spend the usage limit or the money faster. A limit in `.superteam/.env`, with
  a queue in the Agents, can be added later without a change of the engine.
- The pid of a leftover file is checked only by the name of its command:
  `claude` for an agent, by `recover()` and `killLeftovers()` (see
  `agent-manager.md`), and `main.js` for superteam, by `/superteam:start`,
  `/superteam:stop` and the lock (see `control-skill.md`, and "Start" in
  `orchestrator.md`). Another process whose command holds the same name can be
  killed or stopped, or can keep superteam from starting.

### Claude process (`claude-process.md`)

- The prompt is passed as an argument of the command. A very large prompt can go
  over the limit of the length of the arguments of the operating system, and the
  agent does not start.
- An agent runs in a worktree inside the root workspace
  (`.superteam/.r/worktrees/`). `claude` reads the `CLAUDE.md` files of the
  folders above it, so an agent may load the `CLAUDE.md` of the root workspace,
  even one that is not pushed, which goes against ADR 15. It is not checked with
  a real run yet.

## Open questions

These are not decided yet.

### Use cases (`use-cases.md`)

1. **The worker as a person.** Every task is done by an AI agent, so the steps
   of a person who does a task are not defined yet.
2. **The other operation skills.** The person lists, shows and decides the works
   with the operation skills (see
   `05_building-blocks/connector/operation-skill.md`), and does the rest, such
   as an assign, an archive or a retry, by asking for the tools of the MCP
   server. Whether these get skills of their own is not decided.

### HTTP API (`orchestrator.md`)

1. **The tasks.** A query that shows the progress of the tasks of a work, as a
   read-only view. For now the client sees only the work.

### Orchestrator (`orchestrator.md`)

1. **Where the subscriptions are kept.** `storage.md` has no entity for a
   subscription.
