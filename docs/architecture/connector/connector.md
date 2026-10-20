# Connector

Lets people use the system through their AI tools. It is a set of tools, and it
has no flow of its own.

## Component

- `seed-skill.md`: creates the config files of a project.
- `operation-skill.md`: the bridge between a prompt and the MCP tools.
- `mcp-server.md`: an interface through which actors call the engine.

```mermaid
flowchart TD
  actor([Person or AI agent])

  subgraph connector["Connector"]
    seed["Seed Skill<br/>creates the config files"]
    operation["Operation Skill<br/>bridge between a prompt<br/>and the MCP tools"]
    mcp["MCP server<br/>one tool for each request of the API"]
  end

  config[("Config files<br/>workflows, roles of Claude, .gitignore")]
  api(["HTTP API of the engine"])

  actor -->|runs| seed
  actor -->|runs| operation
  actor -->|calls| mcp
  seed -->|writes| config
  operation -->|calls| mcp
  mcp -->|requests| api
```
