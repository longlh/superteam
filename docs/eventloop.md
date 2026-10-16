# Write event loop

The event loop processes a write queue. It is an independent module: it does not
depend on any other component. The other components use it through its queue and
its subscribers.

## Queue

- Every write is an event, a write command, that goes into a single queue. This
  includes the writes from different callers at the same time.
- A write is accepted into the queue and the caller does not wait for it to be
  processed.

The queue needs three places:

- **Queue:** where the events wait. It is file-based: each event is one JSON
  file. Location: `.superteam/.w/queue/{order}.json`, where `{order}` is padded
  with zeros to 6 digits, such as `000001.json`.
- **Claim:** a temporary folder. The event loop claims an event by moving its
  file from the queue to this folder. Location: `.superteam/.w/claim/{id}.json`.
  The folder has at most one file at any time, because the loop processes one
  event at a time.
- **Dead letter queue (DLQ):** a folder for the events that cannot be processed:
  the events whose claim was abandoned, and the events whose retries have
  reached the maximum number of attempts. Location:
  `.superteam/.w/dlq/{id}.json`.

## Event

An event is immutable: once it is created it is never modified. An event has
these fields:

| Field       | Type     | Description                                               |
| ----------- | -------- | --------------------------------------------------------- |
| `order`     | int      | The position of the event in the queue. Max `999999`.     |
| `id`        | string   | The identity of the event.                                |
| `payload`   | Object   | The write command.                                        |
| `createdAt` | datetime | The time the event was created.                           |
| `attempts`  | int      | The number of attempts to process the event. Default `0`. |
| `errors`    | Object[] | The errors of the attempts that failed. Default `[]`.     |

Each entry of `errors` has the fields `attempt` (int, the number of the attempt
that failed, from `1`), `error` (string, the reason) and `time` (datetime, when
it failed). A retry creates a new event, so the factory copies `errors` to it
and the loop adds the new entry: the errors of all the attempts are kept, and
the last one is in the file of the DLQ too.

The `payload` is a write command with these fields:

| Field       | Type   | Description                               |
| ----------- | ------ | ----------------------------------------- |
| `command`   | string | The command. Here it is `write`.          |
| `target`    | string | The path of the file to write.            |
| `src`       | string | The content to write, given as text.      |
| `remoteSrc` | Object | Where to get the content from. See below. |

A write command gives its content in `src` or in `remoteSrc`. If both are set,
`src` is used. The write replaces the whole content of the file at `target`.

The `remoteSrc` is an object with these fields:

| Field     | Type   | Description                                                      |
| --------- | ------ | ---------------------------------------------------------------- |
| `url`     | string | The location of the content: `file://`, `http://` or `https://`. |
| `headers` | Object | The headers of the request.                                      |
| `method`  | string | `GET`. Default `GET`.                                            |
| `body`    | any    | The body of the request. Not used yet.                           |

The `headers`, `method` and `body` are used only when the `url` is `http://` or
`https://`.

The `target` and the path in a `file://` `url` are absolute paths. They can be
outside the workspace.

The event loop comes with a factory that creates an event from a payload:

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

## Loop

The loop claims the events from the queue and processes them one at a time, in
order, so there is no race condition.

The loop runs continuously while there are events in the queue. When the queue
is empty, it waits 1 second before it checks again.

The event loop itself detects the abandoned claims. On each iteration of
`loop()` it does:

1. Check the claim folder. A claim that is still there is abandoned, because a
   write command is processed right away and never waits. Move its event to the
   DLQ, so that the errors do not accumulate.
2. Dequeue and claim a new event. If its `attempts` is greater than 0, it is a
   retry, so the loop waits 2 to the power of `attempts` seconds before it goes
   on.
3. Process the write: apply it to the state. The event loop does not write
   directly to the target file. It writes to a temporary folder first
   (`.superteam/.w/tmp/`), which is a different folder from the claim folder,
   and when the write is finished it moves the file to its target place.
4. If the write succeeds, delete the claim and fire `write:done`. If it fails,
   the event is retried: the factory creates a new event with the same payload,
   `attempts` plus one and the `order` `0`. The event loop enqueues it as
   `000000.json`, which is the head of the queue, so the writes keep their
   order, the claim is deleted, and `write:retry` is fired. Before it creates
   the new event, the loop adds the error to `errors`, and the new event keeps
   all of them. The maximum number of attempts is configurable, and the default
   is 3. When `attempts` reaches it, the event is moved to the DLQ instead, with
   the last error added to `errors` in its file, and `write:error` is fired. An
   event with an invalid structure, or with a syntax error, is never retried: it
   is moved to the DLQ, and `write:error` is fired.

## Life cycle

The event loop has three stages:

1. **Start:** the event loop starts. At this time it:
   1. Deletes every file in the tmp folder: no write is in progress, so what is
      there comes from a crash.
   2. Finds the maximum `order` in the queue, and sets the counter of the
      factory to it. When the queue is empty, the counter is 0.
   3. Recovers from a crash: it checks the abandoned claims. For each one, the
      factory creates a new event with the same payload, the same `attempts` and
      the same `errors`, and the `order` `0`. The event loop enqueues it as
      `000000.json`, which is the head of the queue, and the claim is deleted.
      If `000000.json` already exists, a crash happened in the middle of an
      earlier recovery, and the file is for the same event, so it is
      overwritten.
2. **Loop:** the event loop runs `loop()` again and again (see "Loop").
3. **Shutdown:** the event loop stops gracefully. When it receives a signal such
   as `SIGINT` or `SIGTERM`, it sets the global flag `isShuttingDown` to `true`.
   Before the loop starts a new iteration, it checks this flag. If it is `true`,
   no new iteration starts, so the iteration in progress is finished and then
   the loop stops. A second signal is a force quit: the process exits at once,
   and the claim that is left is recovered at the next start. `start()` can be
   called only once.

## Subscriber

The event loop has subscribers. A subscriber can subscribe to a notification of
the loop, and the loop calls its subscribers when the notification fires. The
loop does not know who its subscribers are. These notifications are not the
events of the queue.

| Notification  | Fired when                                                            |
| ------------- | --------------------------------------------------------------------- |
| `write:done`  | The write of an event has succeeded (step 4 above).                   |
| `write:retry` | The write has failed, and the event is enqueued again (step 4 above). |
| `write:error` | The write has failed for good, and the event goes to the DLQ.         |

Every notification carries the event. For a failed write (`write:retry` and
`write:error`) it is the event with the error of this attempt added to `errors`,
and the notification also carries `error`, the reason as text. The `write:done`
notification also carries:

| Field  | Type     | Description                               |
| ------ | -------- | ----------------------------------------- |
| `hash` | string   | The hash of the content that was written. |
| `time` | datetime | The time the write was done.              |

A subscriber can compare the `hash` with the hash of the file at the `target` of
the event. If they are the same, the subscriber knows that it reads the
up-to-date content of the file.

## Known issues

The event loop is made for an internal tool. These limits are known and
accepted:

- The queue is blocked while the loop waits for a retry.
- There is no limit on where `target` and the path of a `file://` `url` can be,
  and there is no authentication.
- `remoteSrc` supports only `GET`. `POST` is not supported yet.
- `order` has a maximum of `999999`. Creating an event above it throws: it is
  not supported.
- Moving a file from `.superteam/.w/tmp/` to a `target` on another device, such
  as another mount, is not supported: the write fails with an error, and the
  event is retried and then goes to the DLQ. The `target` is expected to be on
  the same device as the workspace.
- An error of the file system inside the loop is not caught (fail fast): the
  loop stops, and the next start recovers from the claim that is left.
