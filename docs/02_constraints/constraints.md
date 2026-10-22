# Constraints

The constraints that the design and the documents follow.

## Technical constraints

| Constraint                                                                                                     | See                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------- |
| The agents run with the `claude` command, signed in with the account of the user, so no API key is needed.     | `claude-process.md` |
| The forge is GitHub, reached through the `gh` command. It is the only forge that is supported for now.         | `git-adapter.md`    |
| One engine runs for a workspace, in its root workspace, and it has no UI.                                      | `engine.md`         |
| The HTTP API listens on localhost only.                                                                        | `orchestrator.md`   |
| The data is files: one JSON file for each entity, under `.superteam/`.                                         | `storage.md`        |
| The values of the environment variables are in `.superteam/.env`, one file for the workspace, not kept in git. | `seed-skill.md`     |

The data in git holds only the names of the environment variables (see
"Subscriptions" in `orchestrator.md`). One engine runs for a workspace, so the
workspace holds their values, in `.superteam/.env`. The orchestrator loads the
file at the start, and the Seed Skill adds it to the `.gitignore` of the
project.

## Organizational constraints

- The system is made for an internal tool, so some limits are accepted (see
  `risks-and-debts.md`).

## Conventions

### The method of the documents

The documents use four methods. Each one answers its own question.

| Method           | Its role       | The question that it answers                                          |
| ---------------- | -------------- | --------------------------------------------------------------------- |
| arc42            | The skeleton   | In which chapter does a piece of information go?                      |
| Views and Beyond | The mindset    | From which views must the system be seen, so that nothing is missing? |
| C4 model         | The microscope | How is the system drawn, from the whole down to the details?          |
| UML              | The complement | How are the views drawn that the C4 model does not draw?              |

- **arc42** gives the skeleton: the 12 chapters, one folder for each (see
  `docs/README.md`).
- **Views and Beyond** gives the mindset: the system is described by several
  views, and by what applies beyond the views, such as the decisions and the
  glossary.
- **The C4 model** gives the microscope: the levels of context, container,
  component and code, each one zooming into a part of the level above it (see
  "Levels of the structure" in `docs/README.md`).
- **UML completes the C4 model.** The C4 model draws only the structure, so it
  has too few kinds of diagram for the views that Views and Beyond asks for,
  such as the behavior over time, the states, the data or the deployment. The
  structure is drawn with the diagrams of the C4 model, and the other views with
  UML, which is convenient and has many kinds of diagram, such as the sequence,
  the activity, the state, the class and the deployment diagram.
