# Claude process

The `claude` process that runs the AI agent of a worker. The engine spawns it,
in the folder of the worktree of the task (step 3 of "Steps" in `agents.md`).

The behavior below was checked with `claude` 2.1.300 (see "Checked behavior").

## Component

- The prompt is made of the instructions of the role, the `instructions` of the
  task, the content of its work, and the artifacts of the tasks it depends on.
- The process runs with the agent of the role (`.claude/agents/{role}.md`), and
  the tools of the role are allowed. Its stdin is `/dev/null`.
- The result is validated against the JSON schema, and it is in the
  `structured_output` field of the JSON output. This is how the worker returns
  its result to the engine.
- **The tools of the role include `StructuredOutput`.** The Seed Skill puts it
  there (see `seed-skill.md`). If a role lists its `tools` without it, the
  schema is not applied, and nothing reports it: `structured_output` is `null`,
  the result is free text, and the exit code is 0 with `is_error` false. The
  engine must treat a `null` `structured_output` as a result that does not match
  the schema. A role with no `tools` line is not limited, and it works.
- **The status and the cost** are in the same JSON output: `is_error`, `subtype`
  and `terminal_reason` for the status, `num_turns`, `total_cost_usd`, and
  `usage` and `modelUsage` for the tokens and the cost of each model.
  `--max-budget-usd` puts a limit on the cost of one run.
- The process inherits the environment and signs in with the user's own account,
  so it needs no API key.
- The session of the process starts the MCP servers of the project, and of the
  plugins, like any session, and the environment is passed to them. So a worker
  starts one more MCP server of the plugin. This does no harm, because the MCP
  server has no logic or state of its own (see `architecture.md`).

## Code

The engine runs the worker with this command:

```
claude -p '<prompt>' --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>
```

### Checked behavior

Each run was a one-line task on `haiku`, in a new project with a few test roles.

| Question                                                | Result                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `--agent {role}` apply the role?                   | Yes. The answer follows the instructions of the role, and the model is the one of the role.                                                                                                 |
| Is the schema applied with `--agent`?                   | Only if the tools of the role allow it. With `tools: Read` it is not applied (`structured_output` is `null`). With no `tools` line, or with `tools: Read, StructuredOutput`, it is applied. |
| Does the session load the project and the plugin again? | Yes. A server in the `.mcp.json` of the project, and a server in a plugin loaded with `--plugin-dir`, are both started by the session, with the environment of the engine.                  |
| What does a run cost?                                   | From 0.0004 to 0.005 USD, in 1 to 3 turns and 1 to 4 seconds. The cost is `total_cost_usd` of the JSON output.                                                                              |

## Open questions

These are not decided yet.

1. **The limit of the account.** `total_cost_usd` is an estimate at list price
   (`costBasis` is `list` in `modelUsage`). Whether the run counts against the
   usage limit of the account is not checked.
