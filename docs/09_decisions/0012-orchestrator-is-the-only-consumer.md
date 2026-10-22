# ADR 12. The containers do not call each other, and the orchestrator is the only consumer

- Status: Accepted
- Supersedes: ADR 5, ADR 7

## Context

The Engine was given the Agents as its job runner, the Notifier asked the HTTP
API of the Engine for more information, the pub/sub of the Engine sent its
events to the part that a subscription named, and the MCP server called the HTTP
API of the Engine. When a container calls an interface that it defines, and the
other container is given to it (inversion of control), it still calls another
container. So the containers could not work on their own.

## Decision

- Each container works on its own, and has a public interface: functions, a
  callback, or pub/sub. The Engine is active: it runs its loop, so it tells its
  state to the outside with pub/sub, such as a job to run. The other containers
  are services: they act only when they are called.
- The containers do not call each other. The orchestrator, one level above them,
  is the only consumer of their interfaces. It holds no logic: it decides whom
  to call, when, and with which input.
- When a container needs another one, it gets a callback that runs in the
  context of the orchestrator, such as `notifier.send(composeMessage)`. The
  logic stays in the container.
- When a logic is needed between two containers, such as comparing the jobs that
  the Engine waits for with the jobs that the Agents ran, one container
  implements it, and the orchestrator only gives it its input.
- The system has one door, the HTTP API, and it is in the orchestrator. The
  Engine takes the requests through its functions.
- The subscriptions belong to the orchestrator: they say which container it
  calls for which topic of the Engine. A subscription holds only the names of
  the environment variables, never their values, because the data is versioned
  in git.

## Consequences

- The Engine has no job runner. It publishes the jobs to run and to stop, and it
  takes the end of a job through a function.
- The Notifier does not call the Engine. The message is composed in a callback
  that the orchestrator calls with the access that it needs.
- The MCP server calls the HTTP API of the orchestrator.
- The pub/sub of the Engine does not wait for its subscribers, so a job to run
  can be lost, or given twice. At the start, the Engine compares the jobs that
  it waits for with the jobs that the Agents ran, and `run()` of the Agents
  skips a job that already runs (see `orchestrator.md`).
