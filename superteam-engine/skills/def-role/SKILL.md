---
name: def-role
description:
  Use when the user wants to define or update the roles of the team of agents of
  the project (the agent files in .claude/agents/), or to set up superteam in a
  project.
---

# Define the roles

A role is an agent file of Claude, `.claude/agents/{role}.md`. The AI chooses
its content. The script `seed.js` writes the file. Never write or edit a role
file by hand.

## Steps

1. Read the project: the README, the docs, the layout of the code, and the
   existing `.claude/agents/` and `.superteam/.p/workflows/`.
2. Propose the roles to the person: for each one a name, a description (when to
   use it), the tools, optionally a model, and the instructions. Wait for the
   person to agree. Change the proposal until they do.
3. Write each role by piping one JSON object to the script, from the workspace
   root (the project folder, not a worktree):

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/scripts/seed.js role <<'EOF'
   {"name":"developer","description":"Writes and tests code","tools":["Read","Edit","Bash"],"model":"sonnet","instructions":"..."}
   EOF
   ```

   The quoted `'EOF'` passes the JSON as it is: the shell changes nothing in it,
   even a `'` or a `$`.

   The script prints the path it wrote. If it fails, report the error and fix
   the JSON.

4. When all roles are written, run:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/scripts/seed.js init
   ```

   It adds `.superteam/.r/` and `.superteam/.env` to `.gitignore` and writes
   `SUPERTEAM_PORT` in `.superteam/.env` when it is missing. It prints the port.

5. Tell the person to commit the files of the setup on the root branch, and to
   push them: `.gitignore`, `.claude/agents/*.md` and
   `.superteam/.p/workflows/*.json`. The agents run in worktrees created from
   the upstream of the root branch, its branch on `origin`, so a role or a
   workflow that is not pushed is not there for them. Offer to make the commit
   and the push, and make them only if the person says yes (leave out a path
   that does not exist yet):

   ```
   git add .gitignore .claude/agents .superteam/.p/workflows
   git commit -m "Set up superteam"
   git push --set-upstream origin HEAD
   ```

6. Check that the setup is on the upstream, from the workspace root:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/scripts/seed.js check
   ```

   It prints `ok` when every file of the setup is on the upstream of the root
   branch. Otherwise it fails with the files that are missing or differ there:
   report them to the person. The setup is not done until the check passes.

## Rules

- `name` is a slug: lowercase letters and digits joined by `-`, up to 63
  characters. `description` is required and is one line.
- `tools` is a list of tool names. The script always adds `StructuredOutput` to
  it, so that the result of the worker is validated. You do not have to list it.
  With no `tools`, the role has no `tools` line.
- A role is an AI agent. Whether a work or a task is done by a person or by an
  AI is decided by the workflow, not by the role.
- Do not create the roles `task-merger` and `work-merger`. They belong to the
  engine and ship with the plugin. The script refuses them.
- Running the skill again overwrites a role file of the same name.
- Write nothing else: no other file of the project.
