# Event loop implementation plan

The plan to implement the module described in `eventloop.md`.

## 1. Scope

- In scope: the event loop module, as `eventloop.md` describes it: the queue,
  the claim and DLQ folders, the event and the factory, the loop, the life
  cycle, and the subscribers.
- Out of scope: the engine, the HTTP API, the reactor that listens to the
  notifications, and the storage layout. The module does not know them.

## 2. Decisions

| Topic               | Decision                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language            | JavaScript, ES modules, Node 24. No runtime dependency.                                                                                                                            |
| Location            | `superteam-engine/src/eventloop/`. Each unit test is next to its code: `paths.js` has `paths.test.js`.                                                                             |
| Test runner         | `node:test` and `node:assert`. No extra dependency.                                                                                                                                |
| Base directory      | A `baseDir` option. The folders are `{baseDir}/.superteam/.w/{queue,claim,dlq,tmp}`.                                                                                               |
| Folders             | Created with `mkdir -p` at start.                                                                                                                                                  |
| Hash                | SHA-256, hex. `id` is the hash of `createdAt` and `order`. The `hash` of `write:done` is of the bytes.                                                                             |
| `createdAt`         | `new Date().toISOString()`, UTC, to the millisecond.                                                                                                                               |
| Content             | Written as bytes (`Buffer`), so a binary file such as an image is kept as it is.                                                                                                   |
| `remoteSrc`         | `file://` with `fs.readFile`, `http(s)` with the global `fetch`, `GET` only. A timeout of 30 seconds.                                                                              |
| Temporary file name | A random uuid with the `.tmp` extension, in `.superteam/.w/tmp/`.                                                                                                                  |
| Validation          | A hand-written validator for the event and the payload. No schema library.                                                                                                         |
| Subscribers         | Called in the order of the subscription, not awaited. A `try` and `catch` only isolates an error of a subscriber from the loop: handling it is out of the scope of the event loop. |
| Options             | `createEventLoop` takes `maxAttempts` (3), `pollIntervalMs` (1000), `sleep` and `now` (for tests). `start()` takes `fetchTimeoutMs` (30000).                                       |
| Counter             | Increased synchronously in `create()`, so two calls in the same process never get the same `order`.                                                                                |

## 3. Layout

```
superteam-engine/src/eventloop/
  index.js            createEventLoop(options): only exports, nothing to test
  index.test.js       the flow tests of the whole module
  paths.js            the folders of the module, and mkdir -p
  paths.test.js
  event.js            the event shape, validation, and the hashes
  event.test.js
  factory.js          the counter, create(), and the atomic enqueue
  factory.test.js
  queue.js            list, claim, delete a claim, move to the DLQ, recover
  queue.test.js
  writer.js           get the content, write to tmp, move to the target
  writer.test.js
  subscribers.js      subscribe and emit, with the errors isolated
  subscribers.test.js
  loop.js             the loop, the retry, the start and the shutdown
  loop.test.js
```

## 4. Public API

```js
const loop = createEventLoop({ baseDir, maxAttempts, pollIntervalMs });

loop.enqueue(payload); // Promise<event>: creates the event and writes it to the queue
loop.subscribe(name, handler); // returns a function that unsubscribes
await loop.start({ fetchTimeoutMs }); // runs the start stage, then the loop, and resolves after shutdown
loop.shutdown(); // sets isShuttingDown to true
```

- `start()` also adds the `SIGINT` and `SIGTERM` handlers, which call
  `shutdown()`. The option `handleSignals: false` turns this off, for tests.
- `enqueue()` can be called before `start()`. The event waits in the queue.

## 5. Steps

Each step comes with the unit test file of its code, next to it. A step ends
with its tests passing before the next step starts.

1. **Foundation** (`paths.js`, `event.js`): the folders, the event shape, the
   validator, the hash functions, and the padding of `order` to 6 digits.
2. **Factory** (`factory.js`): the counter, `create()` with `order`, `id` and
   `createdAt`, the explicit `order` `0` for the retry and the recovery, and the
   atomic enqueue (write to tmp, then move into the queue).
3. **Queue** (`queue.js`): list the queue in `order`, claim the lowest event by
   moving it, delete the claim, move an event to the DLQ, and read the claim.
4. **Writer** (`writer.js`): get the content from `src` or from `remoteSrc`
   (`src` first), write it to tmp, move it to `target`, and return the hash.
5. **Subscribers** (`subscribers.js`): subscribe, unsubscribe, and emit with
   each handler in a try and catch.
6. **Loop** (`loop.js`): one iteration of `loop()` with the four steps of
   `eventloop.md`: the abandoned claim goes to the DLQ, claim a new event and
   wait `2^attempts` seconds for a retry, process the write, then delete the
   claim and fire `write:done`, or retry with `write:retry`, or go to the DLQ
   with `write:error`. An event that is not valid is never retried.
7. **Life cycle** (`loop.js`, `index.js`): the start stage (find the maximum
   `order` and set the counter, recover the abandoned claim as `000000.json`,
   overwrite it if it exists), the loop that waits 1 second when the queue is
   empty, and the shutdown with `isShuttingDown`, checked before each new
   iteration.

## 6. Tests

Unit tests, each in the `.test.js` file next to its code:

- `paths.test.js`: the folders are the right ones, and they are created when
  they are missing.
- `event.test.js`: the padding of `order`, the `id` and the `hash`, and the
  validator.
- `factory.test.js`: 100 calls of `create()` at the same time give 100 different
  `order`, the explicit `order` `0`, and the atomic enqueue.
- `queue.test.js`: the list is in `order`, the claim moves the lowest event, and
  the move to the DLQ.
- `writer.test.js`: the `src` first rule, `file://`, `http` with a local test
  server, and a binary file that is written byte for byte.
- `subscribers.test.js`: the function that `subscribe()` returns unsubscribes
  the handler, and a subscriber that throws does not stop the other subscribers.
- `loop.test.js`: one iteration with fakes for the parts it uses, the wait of
  `2^attempts` seconds, and the check of `isShuttingDown`.

Flow tests, in `index.test.js` because `index.js` only exports. They go through
the public API, with the folders prepared on a temporary disk folder and `sleep`
replaced:

- A write succeeds: the target is written, the claim is deleted, `write:done`
  carries the event, the `hash` and the `time`.
- A write fails: the new event is `000000.json` with `attempts` plus one, and
  `write:retry` is fired. The loop waits `2^attempts` seconds before the retry.
- `attempts` reaches `maxAttempts`: the event is in the DLQ and `write:error` is
  fired.
- An event with a wrong structure, or one that is not valid JSON, goes to the
  DLQ without a retry.
- An abandoned claim found by `loop()` goes to the DLQ.
- Start with a claim: it becomes `000000.json`, and it overwrites an existing
  `000000.json`. The counter starts at the maximum `order` of the queue, and at
  0 when the queue is empty.
- Shutdown during an iteration: the iteration finishes, and no new one starts.
- The `claim` folder never has more than one file.
