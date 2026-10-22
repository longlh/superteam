---
name: def-process
description:
  Use when the user wants to define or update the workflows of the engine (the
  steps of a work and their order) in .superteam/.p/workflows/, or to set up
  superteam in a project.
---

# Define the workflows

A workflow is a JSON file, `.superteam/.p/workflows/{name}.json`. The AI chooses
its content. The script `seed.js` writes the file. Never write or edit a
workflow file by hand.

## Steps

1. Read the project: the README, the docs, the layout of the code, and the
   existing `.claude/agents/` (the roles that steps can use) and
   `.superteam/.p/workflows/`.
2. Propose the workflows to the person: for each one the steps, their order, and
   the role of each step. Wait for the person to agree. Change the proposal
   until they do. If a role is missing, suggest `/superteam:def-role`.
3. Write each workflow by piping one JSON object to the script, from the
   workspace root (the project folder, not a worktree):

   ```
   echo '{"name":"feature","title":"Feature","steps":[{"name":"build","role":"developer"},{"name":"review","role":"reviewer","dependOn":["build"]}]}' | node ${CLAUDE_PLUGIN_ROOT}/src/scripts/seed.js workflow
   ```

   The script prints the path it wrote. If it refuses the workflow, it prints
   the reason: report it and fix the JSON.

4. When all workflows are written, run:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/scripts/seed.js init
   ```

   It adds `.superteam/.r/` and `.superteam/.env` to `.gitignore` and writes
   `SUPERTEAM_PORT` in `.superteam/.env` when it is missing. It prints the port.

## Shape of a workflow

```
{
  "name": "feature",
  "title": "Feature",
  "description": "optional",
  "dod": "optional definition of done",
  "canApprove": "optional",
  "steps": [
    {
      "name": "build",
      "role": "developer",
      "dependOn": [],
      "timeout": 720,
      "dod": "optional",
      "description": "optional",
      "instruction": "optional"
    }
  ]
}
```

- `name` and `title` are required. `steps` is a non-empty list.
- Names of the workflow and of each step are slugs: lowercase letters and digits
  joined by `-`, up to 63 characters. The name of a step is the id of its task
  and is part of a branch name.
- `dependOn` is a list of names of other steps of the same workflow. It must not
  make a cycle. Step names are unique.
- `timeout` is in minutes. The default is 720.
- `role` names a role of `.claude/agents/`.
- Do not use the roles `task-merger` and `work-merger`, and do not create them.
  They belong to the engine.
- Running the skill again overwrites a workflow file of the same name.
- Write nothing else: no other file of the project.
