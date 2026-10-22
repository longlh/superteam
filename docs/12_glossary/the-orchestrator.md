# The orchestrator

The orchestrator is the part one level above the containers. It creates them, it
is the only consumer of their interfaces, and it holds the HTTP API, the only
door of the system. It holds no logic.

See `05_building-blocks/orchestrator.md`.
