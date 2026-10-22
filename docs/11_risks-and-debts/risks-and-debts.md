# Risks and debts

The known limits that are accepted, and the questions that are not decided yet.
Each item comes from the document of the part that it is about.

## Known issues

### Engine (`engine.md`)

- One event is processed at a time, for all the works. A handler that works
  slowly makes all the works wait.

### Engine loop (`engineloop.md`)

The loop is made for an internal tool. These limits are known and accepted:

- One event is processed at a time, for all the works. While a handler works,
  the others wait. The queue is also blocked while the loop waits for a retry.
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
   API, whose paths and bodies are a proposal (see `http-api.md`).

### Operation Skill (`operation-skill.md`)

1. **The level of the API.** `query-data` works by entity, but the HTTP API
   works only at the level of the work (see `http-api.md`). The skills must be
   made to fit it: assign a work, decide on it, and get its state.
2. **`finish`.** It supposes that a person does a task, and for now the engine
   runs every task with its job runner, which runs AI agents (see `engine.md`
   and `agents.md`). The decision on a work is already a request of the API.

### Engine (`engine.md`)

1. **A ready signal.** `start()` of the engine loop resolves only after the
   shutdown, and `enqueue()` is rejected before the start stage is done. The
   engine needs a way to know that the start stage is done, to open the API at
   the right time.
2. **The job runner.** The names of its functions, and the fields of a job and
   of its result, are a proposal. A `merger:ended` event has to say which job of
   the merger has ended.

### HTTP API (`http-api.md`)

1. **The paths and the bodies.** Everything above is a proposal.
2. **The id of a work.** The API answers with the `id` before the work exists,
   so the API creates it. Its format is open (a counter, a random id, or a
   slug), and the path of the work in the storage depends on it.
3. **The tasks.** A query that shows the progress of the tasks of a work, as a
   read-only view. For now the client sees only the work.
4. **A request that is sent twice.** Assigning twice creates two works. A key
   that the client chooses could make the request safe to send again.

### Pub/Sub (`pubsub.md`)

1. **Where the subscriptions are kept.** `storage.md` has no entity for a
   subscription.
2. **The topic.** In the draft schema a topic is `{entity}:{operation}`, such as
   `_task:update`. The events of the engine have a `type` such as `work:assign`.
   What a `topic` matches is not decided.
3. **The name `addon`.** It comes from the draft schema, where the receiver was
   an addon of the plugin. Here the receiver is a part, such as a notifier.

### Action flow (`action-flow.md`)

1. **The topic.** What a topic of a subscription matches is not decided (see
   `pubsub.md`), so the step of the notifier that picks its topics is open.

### Data flow (`data-flow.md`)

1. **The artifacts and the tasks.** An artifact in git refers to a task, but the
   tasks are runtime data, and are not kept.

### Data contract (`storage.md`)

1. **The identity.** The format of `id` for a work and a task: a counter, a
   random id, or a slug. The path comes from it. The `id` of an artifact is
   decided (see "The id of an artifact" in `persistence-data.md`).
