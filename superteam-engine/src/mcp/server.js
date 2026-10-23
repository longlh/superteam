import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWorkspaceRequest } from "./client.js";
import { createTools } from "./tools.js";

const text = (value, isError) => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
  isError,
});

const request = createWorkspaceRequest({
  baseDir: process.cwd(),
});

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
