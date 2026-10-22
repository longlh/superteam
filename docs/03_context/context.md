# Context

The system is `superteam`. It takes a work and gives back the output of the
work, with a team of agents. An actor is a human.

```plantuml
@startuml
!include <C4/C4_Context>
LAYOUT_LEFT_RIGHT()

Person(human, "Human", "Does any job of the system")
System(superteam, "superteam", "Takes a work, runs it with a team of agents, and gives back the output")
System_Ext(claude, "Claude", "Runs the AI agents")
System_Ext(git, "Git", "Stores the results on the machine")
System_Ext(forge, "Forge", "Stores the results on a server, and approves them with pull requests")
System_Ext(chat, "Chat service", "Delivers the notifications to people, such as Google Chat")

Rel(human, superteam, "Uses")
Rel(superteam, chat, "Sends the notifications")
Rel(chat, human, "Notifies")
Rel(superteam, claude, "Uses")
Rel(superteam, forge, "Uses")
Rel(superteam, git, "Uses")
BiRel(git, forge, "Syncs with")
@enduml
```
