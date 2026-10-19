# Seed Skill

It only creates the config files of a project: the workflows of the engine, and
the roles of Claude. It writes nothing else.

## Component

- A person runs it, after the data of the project changes. It is not a part of
  the normal run of the engine.
- Two commands use AI to create the records: `/superteam:def-role` creates the
  roles, and `/superteam:def-process` creates the workflows.
- A role is a record with these fields:

  | Field          | Description                                                                         |
  | -------------- | ----------------------------------------------------------------------------------- |
  | `id`           | The name of the role: lowercase letters, digits, `-` and `_` only.                  |
  | `description`  | What the role is responsible for.                                                   |
  | `kind`         | `bot` or `human`.                                                                   |
  | `instructions` | The file with the business instructions of the role: how this kind of member works. |
  | `tools`        | The tools the role may use.                                                         |
  | `model`        | The model that is suggested for the role.                                           |

- Each role becomes an agent of Claude, in `.claude/agents/{role}.md`: the
  record (`description`, `tools`, `model`) is combined with its `instructions`
  file. The record does not depend on the format of Claude, and the skill is the
  adapter from the record to that format.
- The `tools` of a role must include `StructuredOutput`, or the result of its
  worker is not validated (see `claude-process.md`).

## Code

The script that makes the agent files reads the JSON files directly. It does not
use the engine or the MCP server.

## Open questions

These are not decided yet.

1. **The records of the roles.** The fields above come from the draft schema.
   The persistence data in `storage.md` has no entity for a role yet.
2. **The `.gitignore`.** Runtime data under `.superteam/.r/` is not kept in git
   (see `architecture.md`). Which part adds it to the `.gitignore` of the
   project, if the skill does not?
