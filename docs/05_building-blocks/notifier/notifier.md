# Notifier

Sends the notifications to people. It is a subscriber (see `pubsub.md`): it acts
on the topics that it knows, and it does not know where they come from.

## Component

- It receives the topics about the changes of a work or a task.
- It builds a message for each topic that it acts on, and sends it to people
  through a channel. For now the only one is Google Chat (see `google-chat.md`).

```plantuml
@startuml
rectangle "Whoever subscribes it\nto the topics" as source

rectangle "Notifier" as notifier {
  rectangle "Notifier\nbuilds the message" as core
  rectangle "Google Chat\nposts the message to the webhook" as gchat
}

rectangle "HTTP API of the engine" as api
rectangle "Google Chat space" as space

source ..> core : topics
core --> api : asks for more\ninformation
core --> gchat : message
gchat --> space : webhook
@enduml
```

## Code

When a topic arrives, it may call the HTTP API to get more information for the
message (see `http-api.md`).
