# ADR 4. A role is an agent file of Claude

- Status: Accepted

## Context

A job of a role can be done by an AI. Claude already has the format of an agent:
a name, a description, tools, a model, and instructions.

## Decision

A role of the project is the agent file `.claude/agents/{role}.md`, which the
Seed Skill writes directly. There is no record of the role in the data. The Seed
Skill always puts `StructuredOutput` in the `tools` of the agent file.

## Consequences

- The `claude` process runs with the role (`--agent`), and the model is the one
  of the role.
- If a role lists its `tools` without `StructuredOutput`, the schema is not
  applied and nothing reports it, so a `null` `structured_output` is treated as
  a result that does not match the schema (see `claude-process.md`).
