# Seed Skill

It only creates the config files of a project: the workflows of the engine, and
the roles of Claude. It writes nothing else.

## Component

- A person runs it, after the data of the project changes. It is not a part of
  the normal run of the engine.
- Two commands use AI to create the config files: `/superteam:def-role` creates
  the roles of Claude, and `/superteam:def-process` creates the workflows of the
  engine.
- A role is an agent file of Claude, `.claude/agents/{role}.md`, that the skill
  writes directly. There is no record of the role in the storage. The file has
  the fields of the format of Claude: `name`, `description`, `tools` and `model`
  in its header, and the instructions of the role in its body.
- A role of Claude is an AI agent. Whether a work or a task is done by a person
  or by an AI is decided by the workflow, not by the role.
- It always puts `StructuredOutput` in the `tools` of the agent file, so that
  the result of the worker is validated (see `claude-process.md`).
- It adds `.superteam/.r/` to the `.gitignore` of the project, because the
  runtime data is not kept in git (see `architecture.md`). A line is added only
  if it is missing, so running the skill again changes nothing.
