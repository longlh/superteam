# Notification

The notification is what the engine publishes: what the engine loop fires after
an event (`event:done`, `event:retry` or `event:error`), or a job to run or to
stop (`job:run`, `job:stop`). It is not an event of the queue.

See `05_building-blocks/engine/pubsub.md`.
