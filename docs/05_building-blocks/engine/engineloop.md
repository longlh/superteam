# Engine loop

The engine loop processes the events of the engine, one at a time, in order. An
event is a request or a fact about a work: a work is assigned, a worker has
ended, a work is approved. The loop does not know what an event means. It gives
each event to the handler of its type.

It is an independent module: it does not depend on any other component. It has
three interfaces: its queue, its handlers and its subscribers.

## Component

### Queue

- Every event goes into a single queue. This includes the events from different
  callers at the same time.
- An event is accepted into the queue, and the caller does not wait for it to be
  processed.

### Event

An event is immutable: once it is created it is never modified. An event has
these fields:

| Field       | Type     | Description                                               |
| ----------- | -------- | --------------------------------------------------------- |
| `order`     | int      | The position of the event in the queue. Max `999999`.     |
| `id`        | string   | The identity of the event.                                |
| `payload`   | Object   | What happened or what is asked. See below.                |
| `createdAt` | datetime | The time the event was created.                           |
| `attempts`  | int      | The number of attempts to process the event. Default `0`. |
| `errors`    | Object[] | The errors of the attempts that failed. Default `[]`.     |

Each entry of `errors` has the fields `attempt` (int, the number of the attempt
that failed, from `1`), `error` (string, the reason) and `time` (datetime, when
it failed). A retry creates a new event, so the factory copies `errors` to it
and the loop adds the new entry: the errors of all the attempts are kept, and
the last one is in the file of the DLQ too.

The `payload` has two fields:

| Field  | Type   | Description                                                     |
| ------ | ------ | --------------------------------------------------------------- |
| `type` | string | The kind of event, such as `work:assign`. It picks a handler.   |
| `data` | Object | What the handler of this type needs. The loop does not read it. |

The loop checks only that `type` is a string and that `data` is an object. What
is inside `data` is the business of the handler.

### Handler

A handler processes the events of one type. The caller registers it with the
type, before the loop starts. A type has one handler.

A handler is a function. It takes the event. It succeeds when it returns, and it
fails when it throws. An error that a retry cannot fix has `retryable` set to
`false`: the event goes to the DLQ at once.

The loop processes one event at a time, so a handler follows two rules:

- **It does not wait for a long job.** It starts the job and returns. When the
  job ends, whoever watches it enqueues a new event. A worker that runs for
  hours must not stop the other works.
- **It can be done again.** The queue gives an event at least once: when the
  engine stops in the middle of a handler, the event is processed again at the
  next start. Before each step, the handler checks that the step is not done
  yet, so that a step is never done twice.

A handler can enqueue events.

### Subscriber

The loop has subscribers. A subscriber can subscribe to a notification of the
loop, and the loop calls its subscribers when the notification fires. The loop
does not know who its subscribers are. These notifications are not the events of
the queue.

| Notification  | Fired when                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| `event:done`  | The handler of an event has succeeded (step 4 of "Loop").                    |
| `event:retry` | The handler has failed, and the event is enqueued again (step 4 of "Loop").  |
| `event:error` | The event has failed for good, and it goes to the DLQ.                       |
| `loop:ready`  | The start stage is done, and `enqueue()` can be called. It carries no event. |

Every notification carries the event. For a failed event (`event:retry` and
`event:error`) it is the event with the error of this attempt added to `errors`,
and the notification also carries `error`, the reason as text. The `event:done`
notification also carries `time`, the time the event was done.

### Public API

```js
const loop = createEngineLoop({ baseDir, maxAttempts, pollIntervalMs });

loop.handle(type, handler); // registers the handler of a type
loop.enqueue(payload); // Promise<event>: creates the event and puts it in the queue
loop.subscribe(name, subscriber); // returns a function that unsubscribes
await loop.start(); // runs the start stage, then the loop, and resolves after shutdown
loop.shutdown(); // sets isShuttingDown to true
```

## Code

### Queue storage

The queue needs four places:

- **Queue:** where the events wait. It is file-based: each event is one JSON
  file. Location: `.superteam/.r/engineloop/queue/{order}.json`, where `{order}`
  is padded with zeros to 6 digits, such as `000001.json`.
- **Claim:** a temporary folder. The loop claims an event by moving its file
  from the queue to this folder. Location:
  `.superteam/.r/engineloop/claim/{id}.json`. The folder has at most one file at
  any time, because the loop processes one event at a time.
- **Dead letter queue (DLQ):** a folder for the events that cannot be processed:
  the events that no handler can process, and the events whose retries have
  reached the maximum number of attempts. Location:
  `.superteam/.r/engineloop/dlq/{id}.json`.
- **Tmp:** a temporary folder where the factory writes an event before it moves
  the file into the queue (see "Event factory"). Location:
  `.superteam/.r/engineloop/tmp/`.

### Event factory

The loop comes with a factory that creates an event from a payload:

- `order`: the maximum `order` plus one. The factory keeps this maximum in a
  counter: the counter is set at the start (see "Life cycle"), and the factory
  adds one to it each time it creates an event. When the queue is empty the
  maximum is 0, so the `order` of an event always starts from 1. The `order` `0`
  is never used for a new event: it is reserved for the events that go back to
  the head of the queue, which are the event that is recovered at the start and
  the event of a retry.
- `createdAt`: `now()`.
- `id`: a hash of `createdAt` and `order`.

The factory writes an event atomically. It writes the file of the event to the
temporary folder first, and when the write is finished it moves the file into
the queue, so the loop never reads an event that is half written.

### Loop

The loop claims the events from the queue and processes them one at a time, in
order, so there is no race condition between the events.

The loop runs continuously while there are events in the queue. When the queue
is empty, it waits 1 second before it checks again.

On each iteration of `loop()` it does:

1. Check the claim folder. A claim that is still there is abandoned: the loop
   did not finish its event. Put the event back at the head of the queue, as the
   recovery of the start stage does, so it is processed again. A handler can be
   done again (see "Handler"), so this is safe.
2. Dequeue and claim a new event. If its `attempts` is greater than 0, it is a
   retry, so the loop waits 2 to the power of `attempts` seconds before it goes
   on.
3. Find the handler of the `type` of the event, and call it.
4. If the handler succeeds, delete the claim and fire `event:done`. If it fails,
   the event is retried: the factory creates a new event with the same payload,
   `attempts` plus one and the `order` `0`. The loop enqueues it as
   `000000.json`, which is the head of the queue, so the events keep their
   order, the claim is deleted, and `event:retry` is fired. Before it creates
   the new event, the loop adds the error to `errors`, and the new event keeps
   all of them. The maximum number of attempts is configurable, and the default
   is 3. When `attempts` reaches it, the event is moved to the DLQ instead, with
   the last error added to `errors` in its file, and `event:error` is fired.

An event is never retried, and goes to the DLQ at once with `event:error`, when:

- It has an invalid structure, or a syntax error.
- No handler is registered for its `type`.
- The error of the handler has `retryable` set to `false`.

### Life cycle

The loop has three stages:

1. **Start:** the loop starts. At this time it:
   1. Deletes every file in the tmp folder: no write is in progress, so what is
      there comes from a crash.
   2. Finds the maximum `order` in the queue, and sets the counter of the
      factory to it. When the queue is empty, the counter is 0.
   3. Recovers from a crash: it checks the abandoned claims. For each one, the
      factory creates a new event with the same payload, the same `attempts` and
      the same `errors`, and the `order` `0`. The loop enqueues it as
      `000000.json`, which is the head of the queue, and the claim is deleted.
      If `000000.json` already exists, a crash happened in the middle of an
      earlier recovery, and the file is for the same event, so it is
      overwritten. The handler can be done again (see "Handler"), so the event
      is processed again. A claim that is not valid (broken JSON, or a wrong
      structure) goes to the DLQ, and `event:error` is fired.
2. **Loop:** the loop runs `loop()` again and again (see "Loop").
3. **Shutdown:** the loop stops gracefully. When `shutdown()` is called, for
   example on a signal such as `SIGINT` or `SIGTERM`, it sets the global flag
   `isShuttingDown` to `true`. Before the loop starts a new iteration, it checks
   this flag. If it is `true`, no new iteration starts, so the iteration in
   progress is finished and then the loop stops. A second signal is a force
   quit: the process exits at once, and the claim that is left is recovered at
   the next start. `start()` can be called only once.

`enqueue()` needs the start stage to be done. Before that it is rejected, so the
counter is always right.
