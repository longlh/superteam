# Glossary

The terms of the system, and the terms of the documents. A term of the system is
defined in the document that is named next to it.

## The system

- **Action flow:** the order of the actions that the parts do for one scenario
  (see `action-flow.md`).
- **Agent:** an AI agent that does the work in place of a person. It is run by
  the Agents container (see `agents.md`).
- **Agent manager:** spawns, watches and kills the `claude` processes (see
  `agent-manager.md`).
- **Approver:** the job that reviews a work in its pull request and decides. It
  is a person or a bot (see `storage.md`).
- **Artifact:** an output of a task, kept in `.superteam/.p/artifacts`. It is
  created once and never updated (see `persistence-data.md`).
- **Assigner:** the job that gives a work to the engine (see
  `solution-strategy.md`).
- **Claim:** the temporary folder where the engine loop moves the event that it
  is processing (see `engineloop.md`).
- **Claude process:** the `claude` process that runs one AI agent (see
  `claude-process.md`).
- **Connector:** the container that lets people use the system through their AI
  tools (see `connector.md`).
- **Data contract:** the agreement on where the data is kept and on the entities
  that it holds. It is not a container (see `storage.md`).
- **DLQ:** the dead letter queue, the folder of the events that cannot be
  processed (see `engineloop.md`).
- **DOD:** the checklist that says when a work or a task is done. A work or a
  workflow holds it, and the pull request holds the checklists of the tasks (see
  `storage.md`).
- **Engine:** the container that manages the works and the worktrees. It is the
  team lead: it takes a work, and gives back the output of the work (see
  `engine.md`).
- **Engine loop:** processes the events of the engine one at a time, in order
  (see `engineloop.md`).
- **Event:** a request or a fact about a work, such as `work:assign`. It is
  immutable, and its payload has a `type` and a `data` (see `engineloop.md`).
- **Forge:** the server where the branches are stored, and where a work is
  approved with a pull request. For now it is GitHub (see `git-adapter.md`).
- **Handler:** does the next step of a work. There is one for each type of event
  (see `handlers.md`).
- **Job:** what the job runner runs: a role, the worktree where it runs, and
  what it has to do (see `engine.md`).
- **Job runner:** the interface that the engine needs to run its jobs. The
  Agents container is given to the engine as its job runner (see `engine.md`).
- **Merger:** the job that writes the work, and does all the merges of the work.
  It is a role of the engine (see `agents.md`).
- **Notification:** what the engine loop fires after an event: `event:done`,
  `event:retry` or `event:error`. It is not an event of the queue (see
  `pubsub.md`).
- **Notifier:** the container that sends the notifications to people (see
  `notifier.md`).
- **Orchestrator:** the part above the containers. It creates them and connects
  them (see `building-blocks.md`).
- **Persistence data:** the data that must be kept in git, under `.superteam/.p`
  (see `persistence-data.md`).
- **Pull request:** the way a work is approved. Its merge into the root branch
  is the approval (see `git-adapter.md`).
- **Role:** names a job. A role of the engine is defined by the engine, and a
  role of the project is defined by the project. A role of Claude is an agent
  file (see `storage.md` and `seed-skill.md`).
- **Root branch:** the branch of the root workspace (see `agents.md`).
- **Root workspace:** the place where the engine runs, where `baseDir` points
  (see `storage.md`).
- **Runtime data:** the data that is not kept in git, under `.superteam/.r` (see
  `runtime-data.md`).
- **Seed Skill:** creates the config files of a project: the workflows and the
  roles of Claude (see `seed-skill.md`).
- **Subscription:** a config file that says which part receives which topic of
  the events of the engine (see `pubsub.md`).
- **Task:** a step on the way to a work, created from a step of the workflow of
  the work. It is runtime data (see `runtime-data.md`).
- **Topic:** the events that a subscriber receives (see `pubsub.md`).
- **Work:** what a client gives to the engine. It follows a workflow, it is
  split into tasks, and its result is a pull request (see `http-api.md`).
- **Worker:** the job that does a task. It is the role that the project defines
  in detail, such as the developer (see `solution-strategy.md`).
- **Workflow:** the config file of a work: its DOD, its steps and the roles that
  can approve it (see `storage.md`).
- **Worktree:** the git environment where a job is done. There is one for a work
  and one for a task (see `git-adapter.md`).

## The documents

- **ADR:** an architecture decision record. The decisions are in
  `09_decisions/`.
- **arc42:** the template that gives the 12 chapters of the documents (see
  `README.md`).
- **C4:** the model of the levels of the structure: the context, the container,
  the component and the code (see `README.md`).
- **Chapter:** one of the 12 folders of the documents (see `README.md`).
- **Code:** the level of C4 that says how a part works inside (see `README.md`).
- **Component:** the level of C4 that says what the parts inside one container
  are, and what the interface of each is (see `README.md`).
- **Container:** the level of C4 that says what runs or keeps data, and who
  talks to whom. In the system, it is a process or a store, such as the Engine
  (see `README.md`).
- **Context:** the level of C4 that says who uses the system, and what outside
  it the system depends on (see `README.md`).
- **Data flow:** where each piece of data is created and read, and how it moves
  (see `data-flow.md`).
- **Level:** one of the zoom levels of C4. Each level zooms into one part of the
  level above it (see `README.md`).
- **Sequence diagram:** the diagram that shows one scenario of the action flow:
  the parts in columns, and the messages between them in order (see
  `runtime.md`).
- **Use case:** what an actor wants from the system, written as a black box (see
  `use-cases.md`).
