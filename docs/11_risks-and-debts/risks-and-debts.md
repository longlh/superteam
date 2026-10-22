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
  the loop waits for a retry.
- `order` has a maximum of `999999`. Creating an event above it throws: it is
  not supported.
- An error of the file system inside the loop is not caught (fail fast): the
  loop stops, and the next start recovers from the claim that is left.
- A handler that does not return, because it waits for something that never
  happens, stops the loop. There is no time limit for a handler.

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
