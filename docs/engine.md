# Engine

The engine is the team lead (see the README): it takes a work, and gives back
the output of the work. It does four things:

- It takes the requests for a work.
- It splits a work into tasks.
- It manages the workers: it spawns them, watches them and kills them.
- It reports the results, and takes the requests to approve or to reject a work.

Everything else is done by git. The documents of the parts it uses:

- `data-struct.md`: the entities, and the statuses that are derived from them.
- `engineloop.md`: the loop that processes the events of the engine.
- `spawn-worker.md`: how a worker is spawned to run a task.

The engine is one process, in the root workspace. There is only one engine
instance for a workspace. The git worktrees created for the jobs have no engine.

## Git as the platform

The engine does not keep a store for the results or for the approvals. Git is
the platform, and each part of it has a job:

| Git                       | Job                                                        |
| ------------------------- | ---------------------------------------------------------- |
| Worktree                  | An environment of its own for each worker.                 |
| Remote branch             | Where the results are kept.                                |
| Pull request              | The way a work is approved: the approver reviews it there. |
| Merge of the pull request | The way a result is recorded, as rebase and squash.        |

The engine reaches git and the forge through a git adapter, so that another
forge can be added later. For now only GitHub is supported, and the adapter
needs the `gh` command line.

## Data

The data has two kinds, and each kind has one owner.

| Kind       | Owner  | Where                                                                                                                  | Properties                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Runtime    | Engine | Local files of the root workspace: the progress of the tasks, the works as they were assigned, the pids of the workers | Not in git. Only the engine writes it.            |
| Persistent | Worker | Git: the branch of the worker, on the remote, then the pull request                                                    | In git. The worker writes it in its own worktree. |

The engine does not write persistence data itself. The merger writes the work in
the worktree of the work, and the engine opens the pull request, with its
description. See "Work flow".

## Parts

```mermaid
flowchart TD
  client([AI session, MCP server]) -->|request| api

  api["HTTP API<br/>the work level"]
  loop["Engine loop<br/>one event at a time"]
  handlers["Handlers<br/>one for each type of event"]
  workers["Worker manager<br/>spawns, watches, kills"]
  runtime[("Runtime state<br/>local files")]
  git[("Git<br/>worktrees, branches, pull requests")]

  api -->|enqueue| loop
  api -->|query| runtime
  loop -->|gives the event| handlers
  handlers -->|read, write| runtime
  handlers -->|ask| workers
  handlers -->|worktree, merge, pull request| git
  workers -->|worktree, spawn| git
  workers -.->|enqueue: ended| loop
```

| Part           | Job                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP API       | The only door to the engine. It listens on localhost only, and it works only at the level of the work. It turns a request into an event, and answers a query. |
| Engine loop    | The module of `engineloop.md`: a queue of events and a loop that gives them to the handlers, one at a time, in order.                                         |
| Handlers       | One for each type of event. A handler does the next step of a work (see "Engine loop").                                                                       |
| Worker manager | Spawns the worker process of a task, watches it, and kills it (see `spawn-worker.md`). It does the same for the merger.                                       |
| Runtime state  | The local files of the engine: the tasks and their progress, the works as they were assigned, the pids of the workers.                                        |

The worker manager owns the whole life of a worker process: it starts it,
decides when its run has ended, and kills it. No other part touches a worker
process. Everything that needs to act on a worker goes through the worker
manager: a handler asks it, and a client cannot start or stop a worker. When a
worker ends, the worker manager enqueues an event.

The merger is a role of the engine, and it is spawned like a worker. It is
responsible for the whole unit of the work: it creates the worktree of the work
and the worktrees of the tasks, writes the work, and does all the merges (see
`spawn-worker.md`). A role of the project is concrete when it is put to use: a
developer, a designer, a business analyst. The failure of the merger is handled
like the failure of a worker.

The HTTP API works only at the level of the work. The tasks, the workers and the
worktrees are the business of the engine, and a client has no command for them.

## Engine loop

Every change of a work goes through the engine loop, as an event: a request of a
client, or a fact such as "a worker has ended". The loop gives the events to the
handlers one at a time, in order, for all the works. So two events never change
the state at the same time, and a step such as the pull request cannot be done
twice by two events at the same time.

| Event          | Raised by      | What its handler does                                                                                                                                                                                                                                                                                          |
| -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work:assign`  | HTTP API       | Finds the workflow, creates the work record and the task graph in the runtime, spawns the merger, which creates the worktree of the work from the root branch and writes the work in it, then starts the tasks that are ready: the merger creates the worktree of each task, and the engine spawns its worker. |
| `worker:ended` | Worker manager | Records the result of the task: done, or failed with an `error`. Starts the tasks that are ready now, as `work:assign` does. When all the tasks are done, asks the merger to merge the final tasks.                                                                                                            |
| `merger:ended` | Worker manager | The merger has merged the final tasks and is killed. Opens the pull request, and removes the worktree of the work.                                                                                                                                                                                             |
| `work:decide`  | HTTP API       | When approved, merges the pull request, pulls the root branch and deletes all the branches of the work. When rejected, closes the pull request, creates the record of the work and deletes all the branches.                                                                                                   |

The names of the events are a proposal.

A handler follows the two rules of `engineloop.md`:

- **It does not wait for a long job.** It starts the job and returns. A worker,
  or the merger, enqueues an event when it ends, and that event is processed in
  its turn.
- **It can be done again.** An event is given at least once: if the engine stops
  in the middle of a handler, the event is processed again at the next start.
  Before a step the handler checks that the step is not done yet, so a step is
  never done twice, such as the pull request.

## Work flow

1. **Assign.** A client assigns a work to the engine with one request. The
   engine records that the work was given to it, creates the tasks of the work
   from the steps of its workflow, with no other request, and spawns the merger,
   which creates the worktree of the work, based on the root branch, and writes
   the work in it, from its runtime record.
2. **Run.** The engine runs the tasks by itself: a task starts when it has its
   inputs. For each task the merger prepares a worktree and a branch, based on
   the branch of the task it depends on, and the engine spawns a worker. The
   worker works only in its worktree, and its results are kept on its branch,
   which is on the remote.
3. **Propose.** When all the tasks are done, the work is `PROPOSED`. The merger
   merges the branches of the final tasks into the worktree of the work. The
   engine pushes its branch, and opens a pull request. The description of the
   pull request is a Markdown text that holds the DOD checklists of the tasks.
4. **Decide.** The approver reviews the work in the pull request, and sends the
   decision to the API: approved or rejected. The decision is not stored: the
   merge of the pull request into the root branch is the approval, and the git
   history keeps it. So the work and the engine stay clean, and approving is one
   atomic action, with nothing else to update. If the work is rejected, the
   engine closes the pull request, creates a record of the work in the runtime
   storage, and deletes all the branches of the work. A rejected work is final:
   to try again, a new work is assigned.
5. **Merge.** When the work is approved, the engine merges the pull request into
   the root branch, as rebase and squash. This merge is the approval. The engine
   then pulls the root branch, so the root workspace has the result, and deletes
   all the branches of the work (its own branch and the branches of its tasks),
   so that they do not pile up.

A task is not run again. If its worker fails (the process fails, it is killed
because it runs too long, or its result does not match the schema), the whole
work fails. The worker manager kills the other workers of the work at once, to
save the cost, and the tasks that have not started never start. A failed work is
final, like a rejected one: to try again, a new work is assigned. A failed task
is recorded as `completed` with an `error`, so it is `FAILED` (see "Derived
status" in `data-struct.md`).

## Sequence

### Create and run a work

```mermaid
sequenceDiagram
    actor Client
    participant API as HTTP API
    participant Loop as Engine loop
    participant Handler
    participant WM as Worker manager
    participant Merger
    participant Worker
    participant Git
    participant Runtime as Runtime state

    Client->>API: assign a work
    API->>Loop: enqueue work:assign
    API-->>Client: 202 Accepted
    Loop->>Handler: give work:assign
    Handler->>Runtime: create work record and task graph
    Handler->>WM: spawn merger
    WM->>Merger: spawn
    Merger->>Git: create worktree of the work, from root
    Merger->>Git: write the work, commit
    Merger-->>Handler: ack
    loop for each task that is ready
        Merger->>Git: create worktree of the task, from its dependency
        Handler->>WM: spawn worker
        WM->>Worker: spawn
        Worker->>Git: write results, commit
        Worker-->>WM: ended
        WM->>Loop: enqueue worker:ended
        WM->>Worker: kill
        Loop->>Handler: give worker:ended
        Handler->>Runtime: record the result
        Handler->>Git: remove worktree of the task
    end
    Handler->>Merger: merge final tasks
    Merger->>Git: merge into the worktree of the work
    Merger-->>WM: ended
    WM->>Loop: enqueue merger:ended
    WM->>Merger: kill
    Loop->>Handler: give merger:ended
    Handler->>Git: push, create pull request
    Handler->>Git: remove worktree of the work
```

### Approve or reject a work

```mermaid
sequenceDiagram
    actor Approver
    participant API as HTTP API
    participant Loop as Engine loop
    participant Handler
    participant Git
    participant Runtime as Runtime state

    Approver->>API: approve or reject
    API->>Loop: enqueue work:decide
    API-->>Approver: 202 Accepted
    Loop->>Handler: give work:decide
    alt approved
        Handler->>Git: merge pull request
        Handler->>Git: pull root
        Handler->>Git: delete branches
    else rejected
        Handler->>Git: close pull request
        Handler->>Runtime: create record of the work
        Handler->>Git: delete branches
    end
```

## Life cycle

1. **Start:**
   1. Start the engine loop, with the handlers registered. Its start stage
      recovers the events that were left (see `engineloop.md`).
   2. Open the HTTP API, after the start stage of the engine loop is done,
      because `enqueue()` needs it.
   3. For each pid in `.superteam/.r/workers/{pid}.pid`: kill the process if it
      is alive, and enqueue an event that its worker has failed. The engine
      manages the workers, so a worker that is running without the engine would
      be stalled. This step handles a crash and a shutdown in the same way.
2. **Run:** the API turns the requests into events, and the engine loop gives
   them to the handlers.
3. **Shutdown:** on `SIGINT` or `SIGTERM` the engine stops taking requests,
   kills the workers that are running at once, and shuts the engine loop down.
   The pids of the killed workers stay in their files: the next start records
   their tasks as failed, so their works fail. A second signal is a force quit,
   and the next start recovers from it.

## Known issues

- One event is processed at a time, for all the works. A handler that works
  slowly makes all the works wait.

## Open questions

These are not decided yet.

1. **A ready signal.** `start()` of the engine loop resolves only after the
   shutdown, and `enqueue()` is rejected before the start stage is done. The
   engine needs a way to know that the start stage is done, to open the API at
   the right time.
2. **The HTTP API.** The list of the requests and the queries at the level of
   the work. The ones named so far are: assign a work, approve it, reject it,
   and get the status and the output of a work.
3. **The runtime state.** The layout is in `storage.md`. What is open there is
   the path and the fields of the record of a work.
4. **The module of `eventloop.md`.** The engine does not use it. Is it kept as
   an independent module, or removed?
