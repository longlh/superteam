# Claude process

The `claude` process that runs an AI agent, as the worker of a task or as the
merger. It is spawned in the folder of the worktree of the job (see "The worker"
in `agents.md`).

The behavior below was checked with `claude` 2.1.300 (see "Checked behavior").

## Component

- The prompt is made of the instructions of the role, the `instruction` of the
  task, the content of its work, and the artifacts of the tasks it depends on.
- The process runs with the agent of the role (`.claude/agents/{role}.md`, or
  the agent file of the merger that comes with the plugin), and the tools of the
  role are allowed. Its stdin is `/dev/null`.
- The result is validated against the JSON schema, and it is in the
  `structured_output` field of the JSON output. This is how the worker returns
  its result.
- **The tools of the role include `StructuredOutput`.** The Seed Skill puts it
  there (see `seed-skill.md`). If a role lists its `tools` without it, the
  schema is not applied, and nothing reports it: `structured_output` is `null`,
  the result is free text, and the exit code is 0 with `is_error` false. A
  `null` `structured_output` must be treated as a result that does not match the
  schema. A role with no `tools` line is not limited, and it works.
- **The status and the cost** are in the same JSON output: `is_error`, `subtype`
  and `terminal_reason` for the status, `num_turns`, `total_cost_usd`, and
  `usage` and `modelUsage` for the tokens and the cost of each model.
  `--max-budget-usd` puts a limit on the cost of one run.
- **The plan of the account** decides what a run costs. The process uses the
  account that is signed in, in the config folder of `claude`. With an API
  account, a run costs money, and the cost is `total_cost_usd` of the JSON
  output. With a subscription account, a run uses up the usage limit of the
  plan.
- The process inherits the environment and signs in with the user's own account,
  so it needs no API key.
- The session of the process starts the MCP servers of the project, and of the
  plugins, like any session, and the environment is passed to them. So an agent
  starts one more MCP server of the plugin. This does no harm, because the MCP
  server has no logic or state of its own (see `mcp-server.md`).

## Code

The agent manager runs the agent with this command:

```
claude -p '<prompt>' --agent <role> --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>
```

### Checked behavior

Each run was a one-line task on `haiku`, in a new project with a few test roles.

| Question                                                | Result                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `--agent {role}` apply the role?                   | Yes. The answer follows the instructions of the role, and the model is the one of the role.                                                                                                 |
| Is the schema applied with `--agent`?                   | Only if the tools of the role allow it. With `tools: Read` it is not applied (`structured_output` is `null`). With no `tools` line, or with `tools: Read, StructuredOutput`, it is applied. |
| Does the session load the project and the plugin again? | Yes. A server in the `.mcp.json` of the project, and a server in a plugin loaded with `--plugin-dir`, are both started by the session, with the environment of the agent manager.           |
| What does a run cost?                                   | From 0.0004 to 0.005 USD, in 1 to 3 turns and 1 to 4 seconds. The cost is `total_cost_usd` of the JSON output.                                                                              |
