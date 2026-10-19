# HTTP API

The HTTP API is the only door to the engine (see `engine.md`). A client is an AI
session or the MCP server, and the API listens on localhost only.

The API works only at the level of the work. The tasks, the workers and the
worktrees are the business of the engine, and the client has no request for
them.

There are two kinds of request:

- **A command** asks the engine to do something: assign a work, approve it or
  reject it. The API checks the request, turns it into an event for the engine
  loop, and answers at once that the event is accepted. It does not wait for the
  event to be processed. The client follows the result with a query.
- **A query** asks for the state of a work. The API answers from the runtime
  state and from git. It does not go through the engine loop.

The paths and the bodies below are a proposal.

## Assign a work

```
POST /works
```

The client gives a work to the engine. The engine creates the tasks of the work
from the steps of its workflow, and runs them by itself (see "Work flow" in
`engine.md`). There is no other request.

Body:

| Field         | Type     | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| `workflow`    | string   | The name of the workflow that the work follows.                      |
| `title`       | string   | The title of the work.                                               |
| `description` | string   | What the work is. Optional.                                          |
| `dod`         | string[] | The DOD of the work, to customize the one of the workflow. Optional. |

Answer `202 Accepted`:

| Field     | Type   | Description                                          |
| --------- | ------ | ---------------------------------------------------- |
| `id`      | string | The id of the new work. The client uses it to query. |
| `eventId` | string | The id of the event that was created.                |

The API checks that the body is valid and that the workflow exists. Then it
creates the event `work:assign`. The work is in the status `OPEN` until the
engine has created its tasks.

## Approve or reject a work

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
not, the API answers `409 Conflict`. The check is made again when the event is
processed, because the state can change between the request and the event.

- `approve`: the engine merges the pull request into the root branch. This merge
  is the approval.
- `reject`: the engine closes the pull request, deletes all the branches of the
  work and creates a record of the work in the runtime storage. A rejected work
  is final.

The decision itself is not stored (see "Work flow" in `engine.md`): the result
is in the pull request, and the git history keeps it.

## Query the state of a work

```
GET /works/{id}
```

Answer `200 OK`:

| Field            | Type   | Description                                                                           |
| ---------------- | ------ | ------------------------------------------------------------------------------------- |
| `id`             | string | The id of the work.                                                                   |
| `title`          | string | The title of the work.                                                                |
| `workflow`       | string | The name of its workflow.                                                             |
| `status`         | string | `OPEN`, `IN_PROGRESS`, `DONE` or `FAILED` (see "Derived status" in `data-struct.md`). |
| `approvalStatus` | string | `DRAFT`, `PROPOSED`, `APPROVED` or `REJECTED`. Derived from the pull request.         |
| `pullRequest`    | string | The URL of the pull request, once the work is proposed. Otherwise absent.             |
| `error`          | string | Why the work failed, when its status is `FAILED`. Otherwise absent.                   |

The `status` and the `approvalStatus` are not stored: the engine derives them
when it answers.

## List the works

```
GET /works
```

Answer `200 OK`: the list of all the works. It puts together three sources:

- The works that are running, in the runtime storage.
- The works that are done, in the persistent storage. They were merged from
  their work branch.
- The works that were rejected, in the runtime storage. They are never merged,
  so there is no work branch to read them from: the engine loop creates their
  record at the time it rejects them.

A work that is done is kept for good. All the branches of a work (its own branch
and the branches of its tasks) are deleted when the work ends, so that they do
not pile up as garbage. On another machine, only what the other machines have
accumulated in git matters, and a rejected work, which is not in git, is not
part of it.

Each item has the fields of the state of one work (see "Query the state of a
work").

## Errors

| Status | When                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| `400`  | The body is not valid.                                                                               |
| `404`  | The work or the workflow does not exist.                                                             |
| `409`  | The request does not fit the state of the work, such as a decision on a work that is not `PROPOSED`. |
| `503`  | The engine is starting, and the engine loop is not ready.                                            |

## How a request becomes an event

| Request                     | Event         |
| --------------------------- | ------------- |
| `POST /works`               | `work:assign` |
| `POST /works/{id}/decision` | `work:decide` |

The events `worker:ended` and `merger:ended` do not come from the API: the agent
manager enqueues them (see "Engine loop" in `engine.md`).

## Open questions

These are not decided yet.

1. **The paths and the bodies.** Everything above is a proposal.
2. **The id of a work.** The API answers with the `id` before the work exists,
   so the API creates it. Its format is open (a counter, a random id, or a
   slug), and the path of the work in the storage depends on it.
3. **The works that failed.** A work that failed is never merged either. Is a
   record created for it in the runtime storage, as for a rejected work, and
   does the list show it?
4. **The tasks.** A query that shows the progress of the tasks of a work, as a
   read-only view. For now the client sees only the work.
5. **A request that is sent twice.** Assigning twice creates two works. A key
   that the client chooses could make the request safe to send again.
