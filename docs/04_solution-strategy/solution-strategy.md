# Solution strategy

The principles that the design follows.

0. **Use as much code as possible for the jobs that are determined.** A job
   whose steps and result are known in advance is done by code, not by an AI.
1. **Data has two kinds.**
   - **Persistence:** the data that must be kept in git. It is stored in
     `.superteam/.p` of the root branch. The `.superteam/.p` of a worktree is
     not persistence data until it is merged into the root branch.
   - **Runtime:** the data that does not need to be kept in git. It is stored in
     `.superteam/.r`.
2. **The engine does not create persistence data directly.** It may write
   `.superteam/.p` in a worktree, and it changes the persistence data only by
   merging a pull request in the approve activity.
3. **Persistence data has a purpose.** It is kept so that people can work across
   devices, synced through git, and so that the history of the work is kept. The
   unit of the history is the work.
4. **There are two kinds of job.**
   - **The jobs of the engine:** the jobs that the engine itself understands, so
     the engine defines their interface. They are the assigner, the approver,
     the task merger and the work merger.
   - **The jobs of the project:** the engine knows them only in general, as the
     worker role. The project defines them in detail, such as the developer and
     the business analyst.
5. **Worktrees are used only by the worker and the mergers.** Each of them does
   its job in a git worktree, and its result is kept in a git branch. The engine
   also writes the work in the worktree of the work, when it prepares it.
6. **A job can be done by a person or by an AI.** The two are interchangeable:
   one can take over from the other without interrupting the work.
7. **A worktree can read the runtime data of the root branch.**
8. **The containers do not call each other.** Each container works on its own,
   and has a public interface: functions, a callback, or pub/sub. The engine is
   active: it runs its loop, so it tells its state to the outside with pub/sub.
   The other containers are services: they act only when they are called. The
   orchestrator is the only consumer of the containers, and it holds no logic:
   it decides whom to call, when, and with which input. When a container needs
   another one, it gets a callback that runs in the context of the orchestrator,
   and the logic stays in the container.
9. **The system has one door.** The HTTP API is in the orchestrator, and every
   request from the outside goes through it.
