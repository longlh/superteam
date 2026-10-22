# Connector

Lets people use the system through their AI tools. It is a set of tools, and it
has no flow of its own.

## Component

- `seed-skill.md`: creates the config files of a project.
- `operation-skill.md`: the bridge between a prompt and the MCP tools.
- `mcp-server.md`: an interface through which actors call the system.

```plantuml
@startuml
!include <C4/C4_Component>

Person(person, "Person or AI agent", "")
SystemDb_Ext(config, "Config files", "Workflows, roles of Claude, .gitignore")
System_Ext(api, "HTTP API of the orchestrator", "")

Container_Boundary(connector, "Connector") {
  Component(seed, "Seed Skill", "", "Creates the config files")
  Component(operation, "Operation Skill", "", "Bridge between a prompt and the MCP tools")
  Component(mcp, "MCP server", "", "One tool for each request of the API")
}

Rel(person, seed, "Runs")
Rel(person, operation, "Runs")
Rel(person, mcp, "Calls")
Rel(seed, config, "Writes")
Rel(operation, mcp, "Calls")
Rel(mcp, api, "Requests")
@enduml
```
