import { createInterface } from "node:readline";
import { createWorkspaceRequest } from "./client.js";
import { ERRORS, createMcpHandler, errorAnswer } from "./protocol.js";
import { createTools } from "./tools.js";

// The stdio transport of MCP: one message of JSON-RPC on each line of stdin,
// and one answer on each line of stdout. stdout carries nothing else.
const handle = createMcpHandler({
  name: "superteam",
  version: "0.1.0",
  tools: createTools({
    request: createWorkspaceRequest({
      baseDir: process.cwd(),
    }),
  }),
});

const send = (answer) => {
  process.stdout.write(`${JSON.stringify(answer)}\n`);
};

// The process ends by itself when stdin is closed and the last answer is sent.
createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
}).on("line", async (line) => {
  if (line.trim() === "") {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send(errorAnswer(null, ERRORS.PARSE, "Parse error"));
    return;
  }
  try {
    const answer = await handle(message);
    if (answer !== null) {
      send(answer);
    }
  } catch (error) {
    process.stderr.write(`${error.stack}\n`);
    send(errorAnswer(message?.id ?? null, ERRORS.INTERNAL, "Internal error"));
  }
});
