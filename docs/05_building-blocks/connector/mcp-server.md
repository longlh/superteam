# MCP server

An interface through which actors call the system. It starts with the session of
the AI tool, and it is only a client of the HTTP API of the orchestrator: it has
no logic or state of its own, and it does not work when the orchestrator is not
running. At each call it reads the port of the API, `SUPERTEAM_PORT`, from
`.superteam/.env` of the workspace of the session, so it starts and works even
when the file is written or changed after the session has started. When the file
or the port is missing, or when the API does not answer, the tool answers an
error that says how to fix it.

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
