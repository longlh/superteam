# Handlers

A handler does the next step of a work. There is one handler for each type of
event, and the engine loop gives it the events of its type (see
`engineloop.md`).

## Component

Every change of a work goes through the engine loop, as an event: a request of a
client, or a fact such as "a worker has ended". The loop gives the events to the
handlers one at a time, in order, for all the works. So two events never change
the state at the same time, and a step such as the pull request cannot be done
twice by two events at the same time.

| Event          | Raised by     | What its handler does                                                                                                                                                                                                                                                                                          |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work:assign`  | HTTP API      | Finds the workflow, creates the work record and the task graph in the runtime, spawns the merger, which creates the worktree of the work from the root branch and writes the work in it, then starts the tasks that are ready: the merger creates the worktree of each task, and the engine spawns its worker. |
| `worker:ended` | Agent manager | Records the result of the task: done, or failed with an `error`. Starts the tasks that are ready now, as `work:assign` does. When all the tasks are done, asks the merger to merge the final tasks.                                                                                                            |
| `merger:ended` | Agent manager | The merger has merged the final tasks and is killed. Opens the pull request, and removes the worktree of the work.                                                                                                                                                                                             |
| `work:decide`  | HTTP API      | When approved, merges the pull request, pulls the root branch and deletes all the branches of the work. When rejected, closes the pull request, creates the record of the work and deletes all the branches.                                                                                                   |

The names of the events are a proposal.

A handler follows the two rules of `engineloop.md`:

- **It does not wait for a long job.** It starts the job and returns. A worker,
  or the merger, enqueues an event when it ends, and that event is processed in
  its turn.
- **It can be done again.** An event is given at least once: if the engine stops
  in the middle of a handler, the event is processed again at the next start.
  Before a step the handler checks that the step is not done yet, so a step is
  never done twice, such as the pull request.
