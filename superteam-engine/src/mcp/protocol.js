import { checkInput } from "./tools.js";

// The versions of MCP that the server speaks, the latest first. A client that
// asks for another one gets the latest, and decides whether it can go on.
export const PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

export const ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};

export function errorAnswer(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
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

// Only the arguments that the schema describes reach the tool.
function described(schema, input) {
  return Object.fromEntries(
    Object.entries(input).filter(([name]) =>
      Object.hasOwn(schema.properties, name),
    ),
  );
}

// The answer to one message of JSON-RPC, already parsed: a request gets an
// answer, and a notification or an answer of the client gets null.
export function createMcpHandler({ name, version, tools }) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  async function callTool(params) {
    const tool = byName.get(params?.name);
    if (!tool) {
      return {
        error: [ERRORS.INVALID_PARAMS, `Unknown tool: ${params?.name}`],
      };
    }
    const input = params.arguments ?? {};
    const problem =
      typeof input === "object" && !Array.isArray(input)
        ? checkInput(tool.inputSchema, input)
        : "The arguments must be an object.";
    if (problem !== null) {
      return {
        result: text(problem, true),
      };
    }
    try {
      const answer = await tool.handler(described(tool.inputSchema, input));
      return {
        result: text(answer, answer.status >= 400),
      };
    } catch (error) {
      return {
        result: text(error.message, true),
      };
    }
  }

  const methods = {
    initialize: (params) => ({
      result: {
        protocolVersion: PROTOCOL_VERSIONS.includes(params?.protocolVersion)
          ? params.protocolVersion
          : PROTOCOL_VERSIONS[0],
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name,
          version,
        },
      },
    }),
    ping: () => ({
      result: {},
    }),
    "tools/list": () => ({
      result: {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    }),
    "tools/call": callTool,
  };

  return async function handle(message) {
    const isObject =
      typeof message === "object" &&
      message !== null &&
      !Array.isArray(message);
    const id = isObject && message.id !== undefined ? message.id : null;
    if (!isObject || message.jsonrpc !== "2.0") {
      return errorAnswer(id, ERRORS.INVALID_REQUEST, "Invalid request");
    }
    if (typeof message.method !== "string") {
      // An answer of the client: the server sends no request, so it is dropped.
      return message.id === undefined
        ? errorAnswer(null, ERRORS.INVALID_REQUEST, "Invalid request")
        : null;
    }
    if (message.id === undefined) {
      return null;
    }
    const method = Object.hasOwn(methods, message.method)
      ? methods[message.method]
      : null;
    if (method === null) {
      return errorAnswer(
        id,
        ERRORS.METHOD_NOT_FOUND,
        `Method not found: ${message.method}`,
      );
    }
    const outcome = await method(message.params);
    return outcome.error
      ? errorAnswer(id, ...outcome.error)
      : {
          jsonrpc: "2.0",
          id,
          result: outcome.result,
        };
  };
}
