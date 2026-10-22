# Notification

The notification is what the engine publishes: what the engine loop fires after
an event (`event:done`, `event:retry` or `event:error`) or after its start stage
(`loop:ready`), a job to run or to stop (`job:run`, `job:stop`), or that the
engine is ready (`engine:ready`). It is not an event of the queue.

See `05_building-blocks/engine/pubsub.md`.
