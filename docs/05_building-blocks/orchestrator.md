# Orchestrator

The orchestrator is one level above the containers (see `building-blocks.md`).
It creates the Engine, the Agents and the Notifier, it is the only consumer of
their interfaces, and it holds the only door of the system, the HTTP API. The
Connector is not created by the orchestrator: it is loaded by the AI tool of a
person, with its session, and it reaches the system only through the HTTP API.

The orchestrator holds no logic. It decides whom to call, when, and with which
input. A check, a comparison or a message is the business of a container. When a
container needs another one, the orchestrator gives it a callback that runs in
the context of the orchestrator, and the logic stays in the container.

The orchestrator and the containers that it creates run in one process, in the
root workspace.

## Component

### Connections

| When                                             | The orchestrator calls            | With                                                                                        |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| A request comes to the HTTP API                  | The function of the Engine for it | The path and the body of the request (see "HTTP API")                                       |
| The Engine publishes `job:run`                   | `agents.run(job, onEnded)`        | `onEnded` calls `engine.jobEnded(result)`                                                   |
| The Engine publishes `job:stop`                  | `agents.stopWork(workId)`         | The `workId` of the notification                                                            |
| The Engine publishes the topic of a subscription | `notifier.send(composeMessage)`   | `composeMessage` calls `notifier.composeMessage(event, { getWork })`, with `engine.getWork` |

The names of the functions and of the notifications are a proposal.

### Subscriptions

A subscription is a config file of the orchestrator. It says which container the
orchestrator calls for which topic of the Engine. The container that it names
does not know it. For each subscription, the orchestrator subscribes to the
Engine with the topic, and the Engine matches the topic (see `pubsub.md`).

| Field   | Description                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| `topic` | The events of the Engine that the container receives.                                                             |
| `addon` | The name of the container that the orchestrator calls, such as `notifier`.                                        |
| `env`   | The names that the container expects, mapped to the names of environment variables, such as `webhook` to the URL. |

A subscription holds no secret. Only the names of the environment variables are
stored, never their values, because the data is versioned in git.

### HTTP API

The HTTP API is the only door of the system. A client is anything that sends a
request, such as the MCP server, and the API does not know which one it is. The
API listens on localhost only.

The API works only at the level of the work. The tasks and the worktrees are the
business of the Engine, and the client has no request for them.

Each request is one call of a function of the Engine (see "How a request becomes
a call"). The Engine checks the request, and the API turns its answer into an
HTTP status (see "Errors"). There are two kinds of request:

- **A command** asks the Engine to do something: assign a work, approve it,
  reject it, or archive it. The Engine turns it into an event for its loop, and
  answers at once that the event is accepted. It does not wait for the event to
  be processed. The client follows the result with a query.
- **A query** asks for the state of a work. The Engine answers from the runtime
  state and from git, without its loop.

The paths, the bodies and the names of the functions below are a proposal.

#### Assign a work

```
POST /works
```

The client gives a work to the engine. The engine creates the tasks of the work
from the steps of its workflow, and runs them by itself (see "Assign and run a
work" in `action-flow.md`). There is no other request.

Body:

| Field         | Type     | Description                                                                                                          |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`          | string   | The id of the work, as a slug (see "Identity" in `storage.md`). Optional: when it is absent, the engine creates one. |
| `workflow`    | string   | The name of the workflow that the work follows.                                                                      |
| `title`       | string   | The title of the work.                                                                                               |
| `description` | string   | What the work is. Optional.                                                                                          |
| `dod`         | string[] | The DOD of the work, to customize the one of the workflow. Optional.                                                 |

Answer `202 Accepted`:

| Field     | Type   | Description                                                                        |
| --------- | ------ | ---------------------------------------------------------------------------------- |
| `id`      | string | The id of the work, the one of the body or a new one. The client uses it to query. |
| `eventId` | string | The id of the event that was created.                                              |

The engine checks that the body is valid, that the workflow exists, and that the
id is not used yet. Then it creates the event `work:assign`. So a work that is
sent twice with the same id is created once, and the request is safe to send
again. The work is in the status `OPEN` until the engine has created its tasks.

#### Approve or reject a work

```
POST /works/{id}/decision
```

The approver reviews the work in its pull request, then sends the decision.

Body:

| Field      | Type   | Description            |
| ---------- | ------ | ---------------------- |
| `decision` | string | `approve` or `reject`. |

Answer `202 Accepted` with the `eventId` of the event `work:decide`.

The work must be `PROPOSED`, which means that its pull request is open. If it is
not, the engine refuses it, and the API answers `409 Conflict`. The check is
made again when the event is processed, because the state can change between the
request and the event.

- `approve`: the engine merges the pull request into the root branch. This merge
  is the approval.
- `reject`: the engine closes the pull request and deletes the branches of the
  tasks of the work. The branch of the work is kept on the remote, so the work
  is still listed (see "List the works"). A rejected work is final.

The decision itself is not stored (see "Decide a work" in `action-flow.md`): the
result is in the pull request, and the git history keeps it.

#### Archive a work

```
POST /works/{id}/archive
```

The client removes the trace of a work that is final and was not approved.

Answer `202 Accepted` with the `eventId` of the event `work:archive`.

The work must be `FAILED` or `REJECTED`. If it is not, the engine refuses it,
and the API answers `409 Conflict`. The check is made again when the event is
processed, because the state can change between the request and the event.

The engine deletes the branch of the work, on the remote and on this machine.
The work is no longer listed, and its state can no longer be queried. The pull
request of a rejected work stays closed on the forge, so its history is kept
there.

#### Query the state of a work

```
GET /works/{id}
```

Answer `200 OK`:

| Field            | Type   | Description                                                                       |
| ---------------- | ------ | --------------------------------------------------------------------------------- |
| `id`             | string | The id of the work.                                                               |
| `title`          | string | The title of the work.                                                            |
| `workflow`       | string | The name of its workflow.                                                         |
| `status`         | string | `OPEN`, `IN_PROGRESS`, `DONE` or `FAILED` (see "Derived status" in `storage.md`). |
| `approvalStatus` | string | `DRAFT`, `PROPOSED`, `APPROVED` or `REJECTED`. Derived from the pull request.     |
| `pullRequest`    | string | The URL of the pull request, once the work is proposed. Otherwise absent.         |
| `error`          | string | Why the work failed, when its status is `FAILED`. Otherwise absent.               |

The `status` and the `approvalStatus` are not stored: the engine derives them
when it answers.

#### List the works

```
GET /works
```

Answer `200 OK`: the list of all the works. It puts together three sources:

- The works that are running on this machine, in the worktrees of the works.
- The works that are proposed, that failed or that were rejected, on the
  branches of the works on the remote. A failed or rejected work is never
  merged, so its branch is kept as its trace until it is archived (see
  "Branches" in `git-adapter.md`, and "Archive a work").
- The works that are approved, in the persistent storage. They were merged from
  their work branch.

A work that is approved is kept for good, in git. On another machine, the list
shows only the works that reached the remote, so a work that is running is not
in the list there until it is proposed or fails.

Each item has the fields of the state of one work (see "Query the state of a
work").

#### Errors

The engine refuses a request that it cannot take, and the API turns the reason
into a status:

| Status | When                                                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The body is not valid.                                                                                                                                                                       |
| `404`  | The work or the workflow does not exist.                                                                                                                                                     |
| `409`  | The request does not fit the state of the work, such as an id that is already used, a decision on a work that is not `PROPOSED`, or an archive of a work that is not `FAILED` or `REJECTED`. |
| `503`  | The engine is starting, and the engine loop is not ready.                                                                                                                                    |

#### How a request becomes a call

| Request                     | Function of the Engine | Event          |
| --------------------------- | ---------------------- | -------------- |
| `POST /works`               | `engine.assign`        | `work:assign`  |
| `POST /works/{id}/decision` | `engine.decide`        | `work:decide`  |
| `POST /works/{id}/archive`  | `engine.archive`       | `work:archive` |
| `GET /works/{id}`           | `engine.getWork`       | None           |
| `GET /works`                | `engine.listWorks`     | None           |

The events `worker:ended`, `task-merger:ended` and `work-merger:ended` do not
come from the API: the engine enqueues them when the orchestrator calls
`engine.jobEnded(result)` (see `handlers.md`).

## Code

### Start

1. Load `.superteam/.env` into the environment, and create the Engine, the
   Agents and the Notifier.
2. Subscribe to the Engine: `job:run`, `job:stop`, and the topic of each
   subscription. It is done first, so that no job to run is lost.
3. Start the Engine. Its loop recovers the events that were left (see
   `engineloop.md`).
4. Call `agents.recover()`, which kills the agents that a crash left, and give
   the jobs that it returns to `engine.reconcile(jobs)`. The engine fails the
   tasks of these jobs, and publishes `job:run` again for a job that it waits
   for and that was never run. This step handles a crash and a shutdown in the
   same way.
5. Open the HTTP API, when the Engine is ready (see `risks-and-debts.md`).

### Shutdown

On `SIGINT` or `SIGTERM`, the orchestrator closes the HTTP API, calls
`agents.stopAll()`, and shuts the Engine down. The jobs that were stopped are
failed at the next start, by `engine.reconcile(jobs)`. A second signal is a
force quit, and the next start recovers from it.
