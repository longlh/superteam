# Introduction

`superteam` takes a work, runs it with a team of agents, and gives back the
output of the work. It runs on the workflow of the project that uses it.

This chapter holds what the system must do, without saying how: the actors, the
requirements, and the use cases (see `use-cases.md`). The design is in the other
chapters. The requirements below were gathered from the documents of the design,
and each one points to the document where its design is.

## Actors

- **The person who assigns:** sets up the project, gives a work, and follows it.
- **The approver:** reviews the work, and decides. It is a person or a bot.
- **The worker:** does the tasks. It is a person or an AI.

## Requirements

1. **Assign a work.** A client gives a work with a workflow, a title, and
   optionally an id, a description and a DOD. The system answers at once with
   the `id` of the work (see `orchestrator.md`).
2. **Run the work by itself.** The system creates the tasks of the work from the
   steps of its workflow, with no other request. A task starts when it has its
   inputs (see `engine.md` and `storage.md`).
3. **Keep the results in git.** The results of the tasks are kept in git
   branches, and the work is proposed as a pull request. Its description holds a
   summary of the work, and the DOD checklists of the work and of its tasks (see
   `git-adapter.md`).
4. **Decide on a work.** The approver approves or rejects a work that is
   proposed. The merge of the pull request into the root branch is the approval,
   and the decision itself is not stored (see `0001-approval-is-the-merge.md`).
5. **A failed or a rejected work is final.** A task is not run again. When a
   task fails, the whole work fails, and the other jobs of the work are stopped.
   To try again, a new work is assigned (see
   `0011-work-lives-on-its-branch.md`).
6. **Follow a work.** The client gets the state of a work, and the list of the
   works. The status of a work is `OPEN`, `IN_PROGRESS`, `DONE` or `FAILED`, and
   its approval status is `DRAFT`, `PROPOSED`, `APPROVED` or `REJECTED` (see
   `orchestrator.md` and `storage.md`).
7. **Work across devices.** The results and the history of the work are kept in
   git, so that people can work across devices. The unit of the history is the
   work (see `solution-strategy.md`).
8. **A person or an AI.** A job can be done by a person or by an AI, and one can
   take over from the other without interrupting the work (see
   `solution-strategy.md`).
9. **Notify people.** The system sends the notifications to people, for now
   through Google Chat (see `notifier.md` and `google-chat.md`).
10. **Configure a project.** The workflows and the roles of Claude are config
    files, which a person creates with the Seed Skill (see `seed-skill.md`).
11. **Limit the cost and the time.** An agent that runs longer than the maximum
    time, 12 hours by default, is killed. The cost of one run can be limited
    (see `agent-manager.md` and `claude-process.md`).
12. **One engine for a workspace.** The engine runs on its own, with no UI, and
    only one engine runs for a workspace. The HTTP API listens on localhost only
    (see `engine.md` and `orchestrator.md`).
13. **Archive a work.** A work that failed or was rejected stays listed until
    the client archives it. Archiving deletes its branch, and the pull request
    of a rejected work stays closed on the forge (see `orchestrator.md`).
