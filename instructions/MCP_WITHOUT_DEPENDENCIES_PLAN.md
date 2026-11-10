# MCP server without dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** The plugin has no npm dependency, so that it installs without `npm ci`
and the policy holds of the marketplace on the lockfile and on the package
sources are cleared.

**Architecture:** The MCP server speaks JSON-RPC over stdio itself: one module
answers one message, and `server.js` only reads lines from stdin and writes
answers to stdout. The tools describe their input with plain JSON Schema, and a
small check refuses an input that does not match it. `package.json` and
`package-lock.json` of `superteam-engine/` are removed.

**Tech Stack:** Node.js (built-in modules only), `node:test`, ESLint, Prettier.

**Spec:** the MCP specification, revision `2025-11-25` (lifecycle, tools, stdio
transport), and `docs/05_building-blocks/connector/mcp-server.md`.

## Global Constraints

- No import other than `node:*` and the files of the plugin.
- The supported protocol versions are `2025-11-25`, `2025-06-18`, `2025-03-26`
  and `2024-11-05`, the same as the SDK `1.32.1` that is removed.
- stdout carries only JSON-RPC messages, one per line; anything else goes to
  stderr.
- The six tools keep their names, descriptions and requests.
- Run `npx prettier --write` on each Markdown file that is changed.

## Review Focus

- A client asks for a protocol version that is not supported: the server answers
  with `2025-11-25`, and the client decides.
- A line that is not JSON: the answer is the error `-32700` with id `null`, and
  the server keeps running.
- A notification (no `id`), such as `notifications/initialized`: no answer.
- `tools/call` without a required argument, such as `decide_work` without `id`:
  an error result (`isError: true`), and no request is sent to the API.
- stdin is closed: the process exits.

---

### Task 1: Tools with JSON Schema

**Files:**

- Modify: `superteam-engine/src/mcp/tools.js`
- Test: `superteam-engine/src/mcp/tools.test.js`

**Interfaces:**

- Produces: each tool's `inputSchema` is
  `{ type: "object", properties, required }` (JSON Schema, `required` left out
  when empty); `checkInput(schema, input) -> string | null` (null when the input
  is valid, else a message that names the argument).

- [ ] **Step 1: Write the failing tests**
  - `decide_work` has `required: ["id", "decision"]` and `decision.enum` is
    `["approve", "reject"]`.
  - `assign_work` has `required: ["workflow", "title"]` and `dod` is
    `{ type: "array", items: { type: "string" }, ... }`.
  - `checkInput` gives null for a valid input, and a message with the name of
    the argument for a missing required argument, a wrong type, a value that is
    not in the enum, and an array with an item that is not a string.
- [ ] **Step 2: Run them and see them fail**
      (`node --test superteam-engine/src/mcp/tools.test.js`).
- [ ] **Step 3: Replace zod by JSON Schema, and write `checkInput`**, which
      handles only `string`, `array` of `string`, `enum` and `required`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit.**

### Task 2: The protocol

**Files:**

- Create: `superteam-engine/src/mcp/protocol.js`
- Test: `superteam-engine/src/mcp/protocol.test.js`

**Interfaces:**

- Consumes: the tools of Task 1, `checkInput`.
- Produces:
  `createMcpHandler({ name, version, tools }) -> (message) -> Promise<object | null>`;
  it takes one parsed message and gives the answer, or null for a notification.

- [ ] **Step 1: Write the failing tests**
  - `initialize` with `2025-06-18` answers `protocolVersion: "2025-06-18"`,
    `capabilities: { tools: {} }` and `serverInfo: { name, version }`; with
    `1999-01-01` it answers `2025-11-25`.
  - `notifications/initialized` answers null.
  - `ping` answers `{}`.
  - `tools/list` answers the six tools with `name`, `description` and
    `inputSchema`.
  - `tools/call` answers `{ content: [{ type: "text", text }], isError }`, as
    the old server did: the text is the JSON of the answer of the API, and
    `isError` is true when its status is 400 or more; a thrown error gives its
    message with `isError: true`.
  - `tools/call` with an invalid input gives `isError: true` and does not call
    the handler.
  - An unknown tool gives the error `-32602`; an unknown method gives `-32601`;
    a message that is not an object with `jsonrpc: "2.0"` gives `-32600`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Write `createMcpHandler`.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit.**

### Task 3: The stdio server

**Files:**

- Modify: `superteam-engine/src/mcp/server.js`
- Test: `superteam-engine/src/mcp/server.test.js`

**Interfaces:**

- Consumes: `createMcpHandler` of Task 2, `createTools`,
  `createWorkspaceRequest`.

- [ ] **Step 1: Write the failing test.** It spawns
      `node superteam-engine/src/mcp/server.js` in a temporary folder, writes
      `initialize`, `notifications/initialized`, `tools/list` and a line that is
      not JSON, and checks the three answers on stdout (one per line, nothing
      else), then closes stdin and sees the process exit with code 0.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Rewrite `server.js`** with `node:readline` on stdin; a parse
      error answers `-32700`.
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Commit.**

### Task 4: Remove the dependencies

**Files:**

- Delete: `superteam-engine/package.json`, `superteam-engine/package-lock.json`
- Modify: `package.json` (root), `README.md`,
  `docs/07_deployment/deployment.md`,
  `docs/05_building-blocks/connector/mcp-server.md`

- [ ] **Step 1: Delete the two files**, and add `"type": "module"` to the root
      `package.json`.
- [ ] **Step 2: Check the oldest Node** that runs a script of the plugin without
      a `package.json`: `npx -p node@22.6.0` and `node@22.7.0` on a copy of
      `superteam-engine/` alone. The oldest version that works is the floor in
      the docs.
- [ ] **Step 3: Update the docs:** the floor of Node in `README.md` and
      `deployment.md`; in `deployment.md` the plugin needs no install of
      packages; in `mcp-server.md` the server speaks MCP itself, over stdio,
      with the supported versions.
- [ ] **Step 4: Run `npm test` and `npm run lint`**: all pass, and no warning
      `MODULE_TYPELESS_PACKAGE_JSON`.
- [ ] **Step 5: Try the plugin in a real session** of Claude Code: `/mcp` shows
      `superteam` connected with six tools, and `list_works` answers.
- [ ] **Step 6: Commit.**
