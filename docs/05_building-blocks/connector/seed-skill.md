# Seed Skill

It only creates the config files of a project: the workflows of the engine, the
roles of Claude, and the port of the API. It writes nothing else.

## Component

- It runs after the data of the project changes. It is not a part of the normal
  run of the engine.
- Two commands use AI to create the config files: `/superteam:def-role` creates
  the roles of Claude, and `/superteam:def-process` creates the workflows of the
  engine.
- The name of a workflow and the name of each of its steps are slugs (see
  "Identity" in `storage.md`), because the name of a step is the id of its task,
  and it is in the name of a branch.
- A role is an agent file of Claude, `.claude/agents/{role}.md`, that the skill
  writes directly. There is no record of the role in the data. The file has the
  fields of the format of Claude: `name`, `description`, `tools` and `model` in
  its header, and the instructions of the role in its body.
- A role of Claude is an AI agent. Whether a work or a task is done by a person
  or by an AI is decided by the workflow, not by the role.
- It always puts `StructuredOutput` in the `tools` of the agent file, so that
  the result of the worker is validated (see `claude-process.md`).
- It refuses a role with no `tools`, because under `dontAsk` such an agent gets
  no tool (see `claude-process.md`).
- It does not create the agent files of the task merger and of the work merger.
  They are roles of the engine, and their agent files come with the plugin (see
  `agents.md`).
- It adds `.superteam/.r/` and `.superteam/.env` to the `.gitignore` of the
  project, because the runtime data and the values of the environment variables
  are not kept in git (see `solution-strategy.md` and `constraints.md`). A line
  is added only if it is missing, so running the skill again changes nothing.
- It writes `SUPERTEAM_PORT` in `.superteam/.env`, with a free port, when it is
  missing, so that each workspace has its own port. A value that is there is
  kept.
- The skills end by telling the person to commit `.gitignore`,
  `.claude/agents/*.md` and `.superteam/.p/workflows/*.json` on the root branch,
  and to push them, because the worktrees are checked out from its upstream (see
  ADR 15). They offer to make the commit and the push.
- Then they run `seed.js check`. It fetches, and checks that each workflow and
  each role of the root workspace is on the upstream of the root branch with the
  same content, that each role named by a workflow is there (except the roles of
  the engine), that each role file has a `tools` line, and that the `.gitignore`
  there has its lines. Otherwise it fails with the list of the files to push, so
  a setup that is not pushed is reported at once, not when a work is assigned.
