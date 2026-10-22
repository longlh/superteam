# Pub/Sub

The way the engine tells its state to the outside, to whoever subscribes. The
engine does not know who the subscribers are.

## Component

- It publishes three kinds of notification:
  - The notifications of the engine loop (see `engineloop.md`): `event:done`,
    `event:retry` and `event:error`. Each one carries the event, so a subscriber
    reads what happened from the `payload` of the event, such as its `type`.
  - The notifications of the handlers (see `handlers.md`): `job:run`, which
    carries the job to run, and `job:stop`, which carries the `workId` of the
    jobs to stop.
  - The notification of the engine itself: `engine:ready`, when the start stage
    of the engine loop is done, so the engine can take requests.
- A subscriber subscribes with a topic, with `subscribe(topic, callback)`, and
  the engine matches the topic: it calls the callback for each notification of
  the topic. Nothing is returned to the engine.
- A subscriber is called in the order of its subscription, and the engine does
  not wait for it. An error of a subscriber does not stop the loop or the other
  subscribers.
- A notification is not kept: a subscriber that is not there when it fires does
  not get it. So `job:run` can be lost, or given twice when a handler is done
  again. The engine publishes again a job that was never run, in
  `reconcile(jobs)` (see `engine.md`).
