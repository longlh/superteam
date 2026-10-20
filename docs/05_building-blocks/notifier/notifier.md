# Notifier

Sends the notifications to people. It is a subscriber (see `pubsub.md`): it acts
on the topics that it knows, and it does not know where they come from.

## Component

- It receives the topics about the changes of a work or a task.
- It builds a message for each topic that it acts on, and sends it to people
  through a channel. For now the only one is Google Chat (see `google-chat.md`).

```plantuml
@startuml
!include <C4/C4_Component>

System_Ext(source, "Whoever subscribes it to the topics", "")
System_Ext(api, "HTTP API of the engine", "")
System_Ext(space, "Google Chat space", "")

Container_Boundary(notifier, "Notifier") {
  Component(core, "Notifier", "", "Builds the message")
  Component(gchat, "Google Chat", "", "Posts the message to the webhook")
}

Rel(source, core, "Topics", "async")
Rel(core, api, "Asks for more information")
Rel(core, gchat, "Message")
Rel(gchat, space, "Webhook")
@enduml
```

## Code

When a topic arrives, it may call the HTTP API to get more information for the
message (see `http-api.md`).
