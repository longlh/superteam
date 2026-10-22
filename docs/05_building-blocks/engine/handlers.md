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

| Event          | What its handler does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work:assign`  | Finds the workflow, and creates the worktree of the work. Writes the work in it, from the event, and commits it. Creates the task graph in the runtime of the worktree. Runs the tasks that are ready: creates the worktree of each, and publishes `job:run` for its worker.                                                                                                                                                                                                                                                                                                                                                          |
| `worker:ended` | Records the result of the task: done, or failed with an `error`, and removes the worktree of the task. Runs the tasks that are ready now: creates the worktree of each, and publishes `job:run` for its worker, or for the merger first when the task has more than one dependency. When all the tasks are done, publishes `job:run` for the merger to merge the final tasks. When a task fails, the work fails: `job:stop` is published for the other jobs of the work, the `error` is written in the work and committed, the branch of the work is pushed, and the worktrees of the work and the branches of its tasks are removed. |
| `merger:ended` | Depends on the job that ended. After the merger has merged the dependencies of a task, publishes `job:run` for its worker. After the merger has merged the final tasks, opens the pull request, and removes the worktree of the work. When the merger has failed, the work fails, like a failed worker.                                                                                                                                                                                                                                                                                                                               |
| `work:decide`  | When approved, merges the pull request, pulls the root branch and deletes all the branches of the work. When rejected, closes the pull request and deletes the branches of the tasks. The branch of the work is kept.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `work:archive` | Checks that the work is `FAILED` or `REJECTED`, then deletes the branch of the work, on the remote and on this machine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The names of the events are a proposal.

A handler does not run a job itself. It publishes `job:run` or `job:stop` (see
`pubsub.md`), and the end of a job comes back as an event, through `jobEnded`
(see `engine.md`). A job can be published twice, when a handler is done again,
so a job has an id, and a job that already runs is not run again.

A handler follows the two rules of `engineloop.md`:

- **It does not wait for a long job.** A handler does not run a long job. When a
  job ends, its end is enqueued as a new event, and that event is processed in
  its turn.
- **It can be done again.** An event is given at least once: if the engine stops
  in the middle of a handler, the event is processed again at the next start.
  Before a step the handler checks that the step is not done yet, so a step is
  never done twice, such as the pull request.
