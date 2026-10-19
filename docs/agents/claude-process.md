# Claude process

The `claude` process that runs the AI agent of a worker. The engine spawns it,
in the folder of the worktree of the task (step 3 of "Steps" in `agents.md`).

## Component

- The prompt is made of the instructions of the role, the `instructions` of the
  task, the content of its work, and the artifacts of the tasks it depends on.
- The process runs with the agent of the role (`.claude/agents/{role}.md`), and
  the tools of the role are allowed. Its stdin is `/dev/null`.
- The result is validated against the JSON schema, and it is in the
  `structured_output` field of the JSON output. This is how the worker returns
  its result to the engine.
- The process inherits the environment and signs in with the user's own account,
  so it needs no API key.

## Code

The engine runs the worker with this command:

```
claude -p '<prompt>' --output-format json --json-schema <schema> --permission-mode dontAsk --max-budget-usd <n>
```
