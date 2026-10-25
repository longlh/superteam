# Operation Skill

The bridge between a prompt and the MCP tools. An actor runs it as a slash
command, or an AI agent loads it on its own. It always goes through the MCP
server.

## Component

A skill only calls the tools of the MCP server (see `mcp-server.md`). When a
tool answers an error, the skill reports it as it is.

| Skill          | Syntax                   | What it does                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List the works | `/superteam:works`       | Lists the works with `list_works`: for each, its id, title, status and approval status, and the URL of its pull request when it has one.                                                                                                                                          |
| Show a work    | `/superteam:work <id>`   | Shows the state of a work with `get_work`. When the work has an error, it says whether the agent or the engine failed, and whether the work can be retried with `retry_work`.                                                                                                     |
| Decide a work  | `/superteam:decide <id>` | Shows the state of a work that is `PROPOSED` and the URL of its pull request, and asks the person to review it there, then to approve or reject it, with a reason if they want one. It calls `decide_work` only with the answer of the person, and the reason when they gave one. |
