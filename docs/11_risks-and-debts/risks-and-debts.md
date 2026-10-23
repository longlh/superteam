# Risks and debts

The known limits that are accepted, and the questions that are not decided yet.
Each item comes from the document of the part that it is about.

## Known issues

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
  fails for all the works, not only for that one.
- `listWorks()` finds the approved works in the last 1000 merged pull requests
  of the repository, and keeps those of the branches `works/*`. In a busy
  repository, an old approved work is not listed, but its state can still be
  queried by its id.
- An approved work is read from the branch its pull request was merged on, else
  from the upstream of the root branch. When neither has its file, for example
  when that branch was deleted before it was merged on, the work is no longer
  listed and cannot be queried, but its id stays used.
- The ids of the assigns that are accepted and not processed yet are kept in
  memory. After a restart, while an assign left in the queue is not processed, a
  second assign with the same id is accepted, and the engine creates the work
  once, from the first one.

### Handlers (`handlers.md`)

- If the engine stops between the opening of the pull request of a work and the
  removal of the worktree of the work, and the event is not processed again, the
  worktree of the work is left. Reconcile does not remove it.

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
- The pid of a leftover file is checked only by the name of its command, by
  `recover()` (see `agent-manager.md`) and by `/superteam:stop` (see
  `control-skill.md`). Another process whose command holds the same name can be
  killed or stopped.

### Claude process (`claude-process.md`)

- The prompt is passed as an argument of the command. A very large prompt can go
  over the limit of the length of the arguments of the operating system, and the
  agent does not start.

## Open questions

These are not decided yet.

### Use cases (`use-cases.md`)

1. **The worker as a person.** Every task is done by an AI agent, so the steps
   of a person who does a task are not defined yet.
2. **How the person reaches the system.** The operation skills are not decided
   (see `05_building-blocks/connector/operation-skill.md`).

### MCP server (`mcp-server.md`)

1. **The names and the inputs of the tools.** They follow the requests of the
   API, whose paths and bodies are a proposal (see "HTTP API" in
   `orchestrator.md`).

### Operation Skill (`operation-skill.md`)

1. **The level of the API.** `query-data` works by entity, but the HTTP API
   works only at the level of the work (see "HTTP API" in `orchestrator.md`).
   The skills must be made to fit it: assign a work, decide on it, and get its
   state.
2. **`finish`.** It supposes that a person does a task, and for now every job
   that the engine asks for is run by the Agents, which run AI agents (see
   `orchestrator.md` and `agents.md`). The decision on a work is already a
   request of the API.

### Engine (`engine.md`)

1. **The names.** The names of the functions of the engine are a proposal.

### HTTP API (`orchestrator.md`)

1. **The paths and the bodies.** Everything above is a proposal.
2. **The tasks.** A query that shows the progress of the tasks of a work, as a
   read-only view. For now the client sees only the work.

### Orchestrator (`orchestrator.md`)

1. **Where the subscriptions are kept.** `storage.md` has no entity for a
   subscription.
2. **The name `addon`.** It comes from the draft schema, where the receiver was
   an addon of the plugin. Here it names the container that the orchestrator
   calls, such as the notifier.

### Pub/Sub (`pubsub.md`)

1. **The topic.** In the draft schema a topic is `{entity}:{operation}`, such as
   `_task:update`. The events of the engine have a `type` such as `work:assign`.
   What a `topic` matches is not decided.

### Action flow (`action-flow.md`)

1. **The topic.** What a topic of a subscription matches is not decided (see
   `pubsub.md`), so the step where a subscription matches a topic is open.

### Data flow (`data-flow.md`)

1. **The artifacts and the tasks.** An artifact in git refers to a task, but the
   tasks are runtime data, and are not kept.
