# Notifier

Sends the notifications to people. It is a subscriber of the engine (see
`pubsub.md`).

## Component

- It receives the topics about the changes of a work or a task.
- When a topic arrives, it may call the HTTP API to get more information (see
  `http-api.md`).
- It builds the message, and dispatches it to the notifier of a channel. For now
  the only one is Google Chat (see `google-chat.md`).
