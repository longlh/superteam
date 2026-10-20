# MCP server

An interface through which actors call the engine. It is only a client of the
HTTP API: it has no logic or state of its own, and it does not work when the
engine is not running.

## Component

Each request of the HTTP API (see `http-api.md`) is one tool of the MCP server,
and each tool is one request. A tool does nothing else than send its request and
give back the answer of the API.

| Request                     | What its tool does          |
| --------------------------- | --------------------------- |
| `POST /works`               | Assigns a work.             |
| `POST /works/{id}/decision` | Approves or rejects a work. |
| `GET /works/{id}`           | Gets the state of a work.   |
| `GET /works`                | Lists the works.            |
