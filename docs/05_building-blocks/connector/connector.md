# Connector

Lets people use the system through their AI tools. It is a set of tools, and it
has no flow of its own.

## Component

- `seed-skill.md`: creates the config files of a project.
- `operation-skill.md`: the bridge between a prompt and the MCP tools.
- `mcp-server.md`: an interface through which actors call the engine.

```plantuml
@startuml
actor "Person or AI agent" as person

rectangle "Connector" as connector {
  rectangle "Seed Skill\ncreates the config files" as seed
  rectangle "Operation Skill\nbridge between a prompt\nand the MCP tools" as operation
  rectangle "MCP server\none tool for each request of the API" as mcp
}

database "Config files\nworkflows, roles of Claude, .gitignore" as config
rectangle "HTTP API of the engine" as api

person --> seed : runs
person --> operation : runs
person --> mcp : calls
seed --> config : writes
operation --> mcp : calls
mcp --> api : requests
@enduml
```
