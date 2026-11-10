import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./server.js", import.meta.url));
const folder = mkdtempSync(join(tmpdir(), "mcp-server-"));

after(() => {
  rmSync(folder, {
    recursive: true,
    force: true,
  });
});

test("the server answers MCP on stdout, one line for each request, goes on after a line that is not JSON, and exits when stdin is closed", async () => {
  const child = spawn(process.execPath, [SERVER], {
    cwd: folder,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  const exited = new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  const send = (message) =>
    child.stdin.write(
      `${typeof message === "string" ? message : JSON.stringify(message)}\n`,
    );
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "test",
        version: "0",
      },
    },
  });
  send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  // A line that is not JSON does not stop the server: the next one is answered.
  send("{not json");
  send({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  child.stdin.end();

  assert.equal(await exited, 0);
  const lines = stdout.split("\n");
  assert.equal(lines.pop(), "");
  const answers = lines.map((line) => JSON.parse(line));
  assert.equal(answers.length, 3);
  // JSON-RPC lets the answers come in any order: the client matches the ids.
  const byId = (id) => answers.find((answer) => answer.id === id);
  assert.equal(byId(1).result.protocolVersion, "2025-11-25");
  assert.equal(byId(1).result.serverInfo.name, "superteam");
  assert.equal(byId(2).result.tools.length, 6);
  assert.deepEqual(byId(null), {
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32700,
      message: "Parse error",
    },
  });
});
