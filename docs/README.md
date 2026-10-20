# Documents

The documents follow arc42, which gives the 12 chapters. The chapter of the
building blocks follows the C4 model. A chapter that has no content yet is an
empty folder with a `.gitkeep`. The folder `draft/` holds the legacy documents:
they are not part of the structure, and they are not migrated.

| Chapter              | Folder                  | Holds                                                           |
| -------------------- | ----------------------- | --------------------------------------------------------------- |
| 1. Introduction      | `01_introduction/`      | What the system must do: the requirements and the use cases     |
| 2. Constraints       | `02_constraints/`       | Not written yet                                                 |
| 3. Context           | `03_context/`           | Who uses the system, and what outside it the system depends on  |
| 4. Solution strategy | `04_solution-strategy/` | The principles of the design                                    |
| 5. Building blocks   | `05_building-blocks/`   | The structure: the containers, and the components inside        |
| 6. Runtime           | `06_runtime/`           | What happens over time: the action flow and the data flow       |
| 7. Deployment        | `07_deployment/`        | Not written yet                                                 |
| 8. Concepts          | `08_concepts/`          | The data contract that the containers follow                    |
| 9. Decisions         | `09_decisions/`         | The decisions of the architecture, one ADR for each             |
| 10. Quality          | `10_quality/`           | Not written yet                                                 |
| 11. Risks and debts  | `11_risks-and-debts/`   | The known issues and the open questions                         |
| 12. Glossary         | `12_glossary/`          | The terms of the system and of the documents, one file for each |

Every chapter is a folder, and its main document has the name of the chapter
without the number, such as `03_context/context.md`. The glossary is the
exception: it has one file for each term.

The rules of the glossary:

- A term is one file, named with the singular of the term in lower case, such as
  `agent.md`. A term that has a plural form is described in the same file.
- A container is a proper name, so its file starts with `the-`, such as
  `the-engine.md`. The four containers are `the-agents.md`, `the-connector.md`,
  `the-engine.md` and `the-notifier.md`.
- A reference to a term holds the full path, such as
  `12_glossary/seed-skill.md`, because a term can have the name of a document,
  such as `seed-skill.md`.

## Levels of the structure

Each level zooms into one part of the level above it, and answers one question.

| Level                 | Documents                               | Question                                                                                              | Does not hold                      |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Context            | `03_context/context.md`                 | Who uses the system, and what outside the system does it depend on                                    | The parts inside the system        |
| 2. Container          | `05_building-blocks/building-blocks.md` | What runs or keeps data (a process, a store), who talks to whom                                       | The inside of a container          |
| 3. Component, 4. Code | See the tree in "Component and Code"    | What are the parts inside one container, what is the interface of each, and how does each work inside | The inside of the other components |

Two rules:

- A level does not repeat the details of the level below it. It points to the
  document of that level.
- A level does not contradict the level above it.

## Component and Code

Each container has one document, and each of its components has one document.
Each document holds both levels:

- Component: its interface, what it provides to the outside, and, for a
  container, a diagram of its parts. It does not say who uses it, and it does
  not say whom it calls.
- Code: how it works inside.

The data contract in `08_concepts/storage/` is the exception: it is not a
container.

```
docs/
├── README.md
├── 01_introduction/
│   ├── introduction.md          The actors and the requirements of the system
│   └── use-cases.md             What the actors want from the system
├── 02_constraints/
├── 03_context/
│   └── context.md               Who uses the system, and what it depends on
├── 04_solution-strategy/
│   └── solution-strategy.md     The principles of the design
├── 05_building-blocks/
│   ├── building-blocks.md       The containers
│   ├── engine/
│   │   ├── engine.md            Manages the works and the worktrees
│   │   ├── http-api.md          The only door to the engine, at the level of the work
│   │   ├── pubsub.md            How the engine publishes its events
│   │   ├── engineloop.md        Gives the events of the engine to the handlers, one at a time
│   │   ├── handlers.md          Do the next step of a work, one for each type of event
│   │   └── git-adapter.md       How the engine reaches git and the forge, through `gh` for now
│   ├── connector/
│   │   ├── connector.md         Lets people use the system through their AI tools
│   │   ├── seed-skill.md        Only creates the config files: the workflows and the roles of Claude
│   │   ├── operation-skill.md   The bridge between a prompt and the MCP tools
│   │   └── mcp-server.md        An interface through which actors call the engine
│   ├── agents/
│   │   ├── agents.md            Manages the AI agents that do the work in place of people
│   │   ├── agent-manager.md     Spawns, watches and kills the `claude` processes
│   │   └── claude-process.md    The `claude` processes that run the AI agents
│   └── notifier/
│       ├── notifier.md          Sends the notifications to people
│       └── google-chat.md       Sends the notifications through Google Chat
├── 06_runtime/
│   ├── runtime.md               The method and the rules of the flows
│   ├── action-flow.md           The order of the actions of the parts, for each scenario
│   └── data-flow.md             Where the data is created and read, and how it moves
├── 07_deployment/
├── 08_concepts/
│   └── storage/
│       ├── storage.md           The data contract: the paths and the entities
│       ├── runtime-data.md      The files under `.superteam/.r`
│       └── persistence-data.md  The files under `.superteam/.p`, kept in git
├── 09_decisions/
│   ├── decisions.md             The index of the decisions
│   └── 0001-... .md             One architecture decision record (ADR) for each
├── 10_quality/
├── 11_risks-and-debts/
│   └── risks-and-debts.md       The known issues and the open questions
└── 12_glossary/                 One file for each term, such as `agent.md`
```
