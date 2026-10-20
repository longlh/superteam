# Operation Skill

The bridge between a prompt and the MCP tools. An actor runs it as a slash
command, or an AI agent loads it on its own. It always goes through the MCP
server.

## Component

The skills that come from the draft. They are not decided: see
`risks-and-debts.md`.

| Skill      | Syntax                                | What it does                                                                                                                                                                                |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query data | `/superteam:query-data <entity> [id]` | Queries the data of the project. A record by id is read directly from its data file. The other queries go through the MCP server when it is available, otherwise by listing the data files. |
| Finish     | `/superteam:finish <task\|work> <id>` | Helps a person finish a task, or decide on a work: Claude asks for the role the person acts as and for the content, then calls the finish script. It writes nothing by itself.              |
