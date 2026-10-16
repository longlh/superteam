# Write event loop

How the engine processes its write queue. The engine is the only writer of the
state (see "Engine" in the architecture).

## Queue

- Every write is an event, a write command, that goes into a single queue. This
  includes the writes from different AI sessions at the same time, and the
  results that come back from the workers.
- A write is accepted into the queue and the caller does not wait for it to be
  processed.

The queue needs three places:

- **Queue:** where the events wait. It is file-based: each event is one JSON
  file. Location: `.superteam/.w/queue/{order}.json`.
- **Claim:** a temporary folder. The engine claims an event by moving its file
  from the queue to this folder. Location: `.superteam/.w/claim/{id}.json`.
- **Dead letter queue (DLQ):** a folder for the events that cannot be processed:
  the events whose claim has expired, and the events whose retries have reached
  the maximum number of attempts. Location: `.superteam/.w/dlq/{id}.json`.

## Event

An event is immutable: once it is created it is never modified. An event has
these fields:

| Field       | Type     | Description                                               |
| ----------- | -------- | --------------------------------------------------------- |
| `order`     | int      | The position of the event in the queue.                   |
| `id`        | string   | The identity of the event.                                |
| `payload`   | Object[] | The write command.                                        |
| `createdAt` | datetime | The time the event was created.                           |
| `attempts`  | int      | The number of attempts to process the event. Default `0`. |

Each item of the `payload` is a write command with these fields:

| Field       | Type   | Description                                |
| ----------- | ------ | ------------------------------------------ |
| `command`   | string | The command. Here it is `write`.           |
| `target`    | string | The path of the file to write.             |
| `src`       | string | The content to write, given as text.       |
| `remoteSrc` | string | The path of the file that has the content. |

A write command uses exactly one of `src` and `remoteSrc`.

The event loop comes with a factory that creates an event from a payload:

- `order`: the factory reads the current queue and takes the maximum `order`
  plus one.
- `createdAt`: `now()`.
- `id`: a hash of `createdAt`.

## Loop

The loop claims the events from the queue and processes them one at a time, in
order, so there is no race condition.

The event loop itself detects the expired claims. On each iteration of `loop()`
it does:

1. Check the claim folder. A claim that is still there means the event was
   abandoned, because a write command is processed right away and never waits.
   The claim is expired, so the event is moved to the DLQ.
2. Dequeue and claim a new event.
3. Process the write: apply it to the state. The engine does not write directly
   to the target file. It writes to a temporary folder first
   (`.superteam/.w/tmp/`), which is a different folder from the claim folder,
   and when the write is finished it moves the file to its target place.
4. If the write succeeds, delete the claim. If it needs a retry, the factory
   creates a new event with the same payload and `attempts` plus one, the engine
   enqueues it, and the claim is deleted. When `attempts` reaches the maximum
   number of attempts, the event is moved to the DLQ instead.
