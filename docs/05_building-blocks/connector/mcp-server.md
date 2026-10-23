# MCP server

An interface through which actors call the system. It starts with the session of
the AI tool, and it is only a client of the HTTP API of the orchestrator: it has
no logic or state of its own, and it does not work when the orchestrator is not
running. It reads the port of the API, `SUPERTEAM_PORT`, from `.superteam/.env`
of the workspace of the session.

## Component

Each request of the HTTP API (see "HTTP API" in `orchestrator.md`) is one tool
of the MCP server, and each tool is one request. A tool does nothing else than
send its request and give back the answer of the API.

| Request                     | What its tool does          |
| --------------------------- | --------------------------- |
| `POST /works`               | Assigns a work.             |
| `POST /works/{id}/decision` | Approves or rejects a work. |
| `POST /works/{id}/archive`  | Archives a work.            |
| `POST /works/{id}/retry`    | Retries a work.             |
| `GET /works/{id}`           | Gets the state of a work.   |
| `GET /works`                | Lists the works.            |
