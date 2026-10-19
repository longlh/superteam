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

| Level        | Documents                    | Question                                                                                 | Does not hold                   |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| 1. Context   | `architecture.md`            | Who uses the system, and what outside the system does it depend on                       | The parts inside the system     |
| 2. Container | `architecture.md`            | What runs or keeps data (a process, a store), what are the principles, who talks to whom | The inside of a container       |
| 3. Component | See the table in "Component" | What are the parts inside one container, and what is the contract between them           | The inside of a module          |
| 4. Code      | See the table in "Code"      | How does an independent module work inside                                               | How the other components use it |

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
    git["Git<br/>Where the results are kept<br/>on the machine"]
    forge["Forge<br/>Where the results are kept"]

    human -->|Uses| superteam
    superteam -->|Notifies| human
    superteam -->|Uses| claude
    superteam -->|Uses| forge
    superteam -->|Uses| git
    git <-->|Syncs with| forge
```

## Container

`superteam` is made of five parts:

- **Engine:** manages the works and the worktrees. It keeps its data in the
  Storage, and uses Git and the forge. It talks with the other parts through an
  HTTP API and pub/sub.
- **Connector:** lets people use the system through their AI tools.
- **Agents:** manages the AI agents that do the work in place of people. It
  talks with the engine through the HTTP API and pub/sub.
- **Notifier:** sends the notifications to people. It talks with the engine
  through the HTTP API and pub/sub.
- **Storage:** keeps the data of the system: the runtime data and the
  persistence data.

```mermaid
flowchart LR
    human(["Human<br/>Does any job of the system,<br/>and receives the notifications"])

    subgraph superteam["superteam"]
        connect["Connector<br/>Lets people use the system<br/>through their AI tools"]
        engine["Engine<br/>Manages the works<br/>and keeps their results"]
        agents["Agents<br/>Manages the AI agents that<br/>do the work in place of people"]
        notifier["Notifier<br/>Sends the notifications to people"]
        storage["Storage<br/>Keeps the runtime data<br/>and the persistence data"]
    end

    claude["Claude<br/>Runs the AI agents"]
    git["Git<br/>Keeps the worktrees and<br/>the branches on the machine"]
    forge["Forge<br/>Where the results are kept"]

    human -->|Does the jobs| connect
    connect -->|Requests| engine
    connect -->|Configures| claude
    connect -->|Configures| storage
    agents -->|Requests| engine
    engine -->|Informs| agents
    notifier -->|Requests| engine
    engine -->|Informs| notifier
    engine -->|Keeps data in| storage
    storage <-->|Syncs with| git
    git <-->|Syncs with| forge
    notifier -->|Notifies| human
    agents -->|Uses| claude
    engine -->|Uses| forge
    engine -->|Uses| git
```

## Component

Each container is broken down into components below. The inside of a component
is in its own document.

### Engine

| Component   | Job                                                                                                                                                         | Document        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| HTTP API    | The only door to the engine, at the level of the work.                                                                                                      | `http-api.md`   |
| Pub/Sub     | The way the engine informs the other parts about its events, such as the Agents and the Notifier.                                                           | None yet        |
| Engine loop | Gives the events of the engine to the handlers, one at a time.                                                                                              | `engineloop.md` |
| Handlers    | Do the next step of a work, one for each type of event.                                                                                                     | `engine.md`     |
| Git adapter | The way the engine reaches git and the forge, so that another forge can be added later.<br>Only GitHub is supported for now, through the `gh` command line. | `engine.md`     |

### Connector

| Component       | Job                                                                                                                                                                          | Document |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Seed Skill      | Only creates the config files: the workflows of the engine and the roles of Claude.                                                                                          | None yet |
| Operation Skill | The bridge between a prompt and the MCP tools.<br>An actor runs it as a slash command, or an AI agent loads it on its own.<br>It always goes through the MCP server.         | None yet |
| MCP server      | An interface through which actors call the engine.<br>It is only a client of the HTTP API: no logic or state of its own.<br>It does not work when the engine is not running. | None yet |

### Agents

| Component      | Job                                                                                                                                           | Document          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Agent manager  | Spawns, watches and kills the `claude` processes that run the AI jobs of the Worker and the Merger.                                           | `spawn-worker.md` |
| Claude process | The `claude` processes that run the AI agents of the Worker and the Merger.<br>A result comes back to the engine, not through the MCP server. | `spawn-worker.md` |

### Notifier

| Component   | Job                                                    | Document |
| ----------- | ------------------------------------------------------ | -------- |
| Google Chat | Sends the notifications to people through Google Chat. | None yet |

### Storage

| Component        | Job                                                                                               | Document                       |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| Runtime data     | The files of the engine under `.superteam/.r`: the works, the tasks and their progress, the pids. | `storage.md`, `data-struct.md` |
| Persistence data | The files under `.superteam/.p` that are kept in git: the works, the workflows and the artifacts. | `storage.md`                   |

## Code

The inside of each component is in its own document.

| Container | Component        | Document        |
| --------- | ---------------- | --------------- |
| Engine    | HTTP API         | None yet        |
| Engine    | Pub/Sub          | None yet        |
| Engine    | Engine loop      | `engineloop.md` |
| Engine    | Handlers         | None yet        |
| Engine    | Git adapter      | None yet        |
| Connector | Seed Skill       | None yet        |
| Connector | Operation Skill  | None yet        |
| Connector | MCP server       | None yet        |
| Agents    | Agent manager    | None yet        |
| Agents    | Claude process   | None yet        |
| Notifier  | Google Chat      | None yet        |
| Storage   | Runtime data     | None yet        |
| Storage   | Persistence data | None yet        |
