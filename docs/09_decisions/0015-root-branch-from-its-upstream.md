# ADR 15. The engine reads the root branch from its upstream, and never writes to the local one

- Status: Accepted

## Context

The engine based the works on the local root branch, and after each approve it
pulled the root branch into the root workspace (`git pull --ff-only`), so that
the root workspace had the result. But the root workspace is also where people
work. In a team, the local root branch and its remote branch often differ: a
person has commits that are not pushed, or changes that are not committed, while
a teammate pushes to the remote. Then the pull fails, a plain `git pull` can
leave a conflict in the workspace of the person or depend on their git config,
and the commits that are not pushed go into the pull request of the next work.
The root branch was also read at each call, so a person who switched the branch
of the root workspace while a work ran changed the branch of that work.

## Decision

- The source of the engine is the upstream of the root branch: the remote branch
  that the root branch tracks in the root workspace. It is read from git, not
  assumed, because its name can differ from the name of the root branch. It must
  be on the remote `origin`, because the engine pushes the branches of the works
  there and opens the pull requests there. Without such an upstream, superteam
  does not start, and a work is not assigned.
- The root branch is read when a work is assigned, and the work keeps the name
  of its upstream branch in `base`. The worktree of the work is based on that
  upstream, after a fetch, and its pull request is opened on `base`. A task with
  no dependency is based on the branch of its work, so that all the tasks of a
  work start from the same commit.
- The engine fetches, and never pulls, merges or commits into the local root
  branch.
- The engine reads what is committed with git, not from the files of the root
  workspace: the workflow from the upstream of the root branch when a work is
  assigned, and an approved work from the branch on which its pull request was
  merged, or from the upstream of the root branch when that branch no longer has
  it.
- The approved works are listed from the merged pull requests of the branches of
  the works, not from a folder of the root branch.

## Consequences

- The engine never changes the workspace of a person: no conflict, no merge
  commit, and no dependence on their git config.
- A commit that is not pushed never goes into a work. A role, a workflow or a
  change is used by superteam only when it is pushed.
- Each work starts from the latest root branch of the team, after a fetch.
- A person can switch the branch of the root workspace while a work runs: the
  work keeps its `base`. To assign a work on another branch, the person checks
  that branch out first.
- The result of an approved work reaches the root workspace only when the person
  pulls the root branch.
- The list of the works does not depend on the branch that is checked out, and
  it holds the approved works of a teammate too.
- Listing the works makes one more call to the forge.
