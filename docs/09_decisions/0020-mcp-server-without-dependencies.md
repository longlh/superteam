# ADR 20. The MCP server speaks MCP itself, with no package

- Status: Accepted

## Context

The MCP server was built on `@modelcontextprotocol/sdk` and `zod`, so the plugin
had a `package.json` and a lockfile, and its install ran `npm ci`. The directory
of Claude plugins holds a plugin whose install reads a lockfile, or a
`package.json` above the plugin, for a review, and it can refuse it when the
organization of the submitter is not Verified. The server uses little of the
SDK: four methods of JSON-RPC over stdio, and six tools whose inputs are
strings, arrays of strings and enums.

## Decision

- The server reads one message of JSON-RPC on each line of stdin, and writes
  each answer on a line of stdout. It answers `initialize`, `ping`, `tools/list`
  and `tools/call`, for the versions of MCP from `2024-11-05` to `2025-11-25`.
- The input of each tool is described with JSON Schema, and a small check
  refuses an input that does not match it.
- The plugin has no `package.json` and no lockfile. Node finds that its files
  are ES modules from their syntax, so the floor of Node is 22.7.

## Consequences

- The plugin installs with no package, and needs only Node.
- A new version of MCP is not supported until the server is changed: a client
  that asks for it gets `2025-11-25`.
- A `package.json` with `"type": "commonjs"` in a folder above the plugin breaks
  it.
