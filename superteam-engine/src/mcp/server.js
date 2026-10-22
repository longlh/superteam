import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApiClient } from "./client.js";
import { createTools } from "./tools.js";

function readPort() {
  try {
    return parseEnv(
      readFileSync(join(process.cwd(), ".superteam/.env"), "utf8"),
    ).SUPERTEAM_PORT;
  } catch {
    return undefined;
  }
}

const text = (value, isError) => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
  isError,
});

const port = readPort();
const request = port
  ? createApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
    }).request
  : async () => {
      throw new Error(
        "SUPERTEAM_PORT is not set in .superteam/.env. Run /superteam:def-role or /superteam:def-process to seed it.",
      );
    };

const server = new McpServer({
  name: "superteam",
  version: "0.1.0",
});
for (const tool of createTools({
  request,
})) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input) => {
      try {
        const answer = await tool.handler(input);
        return text(answer, answer.status >= 400);
      } catch (error) {
        return text(error.message, true);
      }
    },
  );
}

await server.connect(new StdioServerTransport());
