# Root branch

The root branch is the branch of the root workspace. The engine uses its
upstream, the remote branch on `origin` that it tracks: it bases the works on it
and reads from it, and it never writes to the local branch (see ADR 15).

See `05_building-blocks/agents/agents.md`.
