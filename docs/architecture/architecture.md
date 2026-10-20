# Architecture

## Principles

0. **Use as much code as possible for the jobs that are determined.** A job
   whose steps and result are known in advance is done by code, not by an AI.
1. **Data has two kinds.**
   - **Persistence:** the data that must be kept in git. It is stored in
     `.superteam/.p`.
   - **Runtime:** the data that does not need to be kept in git. It is stored in
     `.superteam/.r`.
2. **The engine does not create persistence data directly.** It changes
   persistence data indirectly, by merging a pull request in the approve
   activity.
3. **Persistence data has a purpose.** It is kept so that people can work across
   devices, synced through git, and so that the history of the work is kept. The
   unit of the history is the work.
4. **There are two kinds of job.**
   - **The jobs of the engine:** the jobs that the engine itself understands, so
     the engine defines their interface. They are the assigner, the approver and
     the merger.
   - **The jobs of the project:** the engine knows them only in general, as the
     worker role. The project defines them in detail, such as the developer and
     the business analyst.
5. **Worktrees are used only by the worker and the merger.** Each of them does
   its job in a git worktree, and its result is kept in a git branch.
6. **A job can be done by a person or by an AI.** The two are interchangeable:
   one can take over from the other without interrupting the work.
7. **A worktree can read the runtime data of the root branch.**

## Document levels

The documents follow the C4 model. Each level zooms into one part of the level
above it, and answers one question.

| Level                 | Documents                            | Question                                                                                              | Does not hold                      |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Context            | `architecture.md`                    | Who uses the system, and what outside the system does it depend on                                    | The parts inside the system        |
| 2. Container          | `architecture.md`                    | What runs or keeps data (a process, a store), what are the principles, who talks to whom              | The inside of a container          |
| 3. Component, 4. Code | See the tree in "Component and Code" | What are the parts inside one container, what is the interface of each, and how does each work inside | The inside of the other components |

Two rules:

- A level does not repeat the details of the level below it. It points to the
  document of that level.
- A level does not contradict the level above it.

## Context

The system is `superteam`. It takes a work and gives back the output of the
work, with a team of agents. An actor is a human.

```mermaid
flowchart LR
    human(["Human<br/>Does any job of the system"])
    superteam["superteam<br/>Takes a work, runs it with a team of agents,<br/>and gives back the output"]
    claude["Claude<br/>Runs the AI agents"]
    git["Git<br/>Stores the results on the machine"]
    forge["Forge<br/>Stores the results on a server,<br/>and approves them with pull requests"]

    human -->|Uses| superteam
    superteam -->|Notifies| human
    superteam -->|Uses| claude
    superteam -->|Uses| forge
    superteam -->|Uses| git
    git <-->|Syncs with| forge
```

## Container

`superteam` is made of four parts:

- **Engine:** manages the works and the worktrees. It keeps its runtime files
  following the data contract, and uses Git and the forge. It provides an HTTP
  API and pub/sub, and it does not know who uses them. It needs a job runner to
  run the jobs, and it is given one.
- **Connector:** lets people use the system through their AI tools.
- **Agents:** manages the AI agents that do the work in place of people. It runs
  the agents of the jobs that it is given, and it calls back when a job ends.
- **Notifier:** sends the notifications to people. It acts on the topics that it
  knows, and it does not know where they come from.

The containers do not know each other. The orchestrator of `superteam`, which is
above the containers, creates them and connects them. When it creates a
container, it gives it what the container needs, as an interface that the
container defines: for example, it gives the Engine the Agents as its job
runner. It also subscribes the Notifier to the topics of the Engine.

The data is not a container. `storage.md` is the data contract: the paths and
the entities that the containers follow when they read or write data. The
runtime files are inside the container that owns them, and follow the contract.

```mermaid
flowchart LR
    human(["Human<br/>Does any job of the system,<br/>and receives the notifications"])

    subgraph superteam["superteam"]
        connect["Connector<br/>Lets people use the system<br/>through their AI tools"]
        engine["Engine<br/>Manages the works<br/>and the worktrees"]
        agents["Agents<br/>Manages the AI agents that<br/>do the work in place of people"]
        notifier["Notifier<br/>Sends the notifications to people"]
    end

    claude["Claude<br/>Runs the AI agents"]
    git["Git<br/>Stores the worktrees and<br/>the branches on the machine"]
    forge["Forge<br/>Stores the branches on a server,<br/>and approves the works with pull requests"]

    human -->|Does the jobs| connect
    connect -->|Requests| engine
    connect -->|Configures| claude
    connect -->|Configures| git
    notifier -->|Requests| engine
    agents -->|Uses| git
    git <-->|Syncs with| forge
    notifier -->|Notifies| human
    agents -->|Uses| claude
    engine -->|Uses| forge
    engine -->|Uses| git
```

## Component and Code

Each container has one document, and each of its components has one document.
The folder `storage/` is the exception: it holds the data contract, which is not
a container. Each document holds both levels:

- Component: its interface, what it provides to the outside, and, for a
  container, a diagram of its parts. It does not say who uses it, and it does
  not say whom it calls.
- Code: how it works inside.

```
docs/architecture/
├── architecture.md          The context, the containers and the principles
├── engine/
│   ├── engine.md            Manages the works and the worktrees
│   ├── http-api.md          The only door to the engine, at the level of the work
│   ├── pubsub.md            How the engine publishes its events
│   ├── engineloop.md        Gives the events of the engine to the handlers, one at a time
│   ├── handlers.md          Do the next step of a work, one for each type of event
│   └── git-adapter.md       How the engine reaches git and the forge, through `gh` for now
├── connector/
│   ├── connector.md         Lets people use the system through their AI tools
│   ├── seed-skill.md        Only creates the config files: the workflows and the roles of Claude
│   ├── operation-skill.md   The bridge between a prompt and the MCP tools
│   └── mcp-server.md        An interface through which actors call the engine
├── agents/
│   ├── agents.md            Manages the AI agents that do the work in place of people
│   ├── agent-manager.md     Spawns, watches and kills the `claude` processes
│   └── claude-process.md    The `claude` processes that run the AI agents
├── notifier/
│   ├── notifier.md          Sends the notifications to people
│   └── google-chat.md       Sends the notifications through Google Chat
└── storage/
    ├── storage.md           The data contract: the paths and the entities
    ├── runtime-data.md      The files under `.superteam/.r`
    └── persistence-data.md  The files under `.superteam/.p`, kept in git
```
