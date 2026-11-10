// The input of a tool is described with JSON Schema, as MCP sends it. Only the
// parts that the tools use are written and checked: a string, an array of
// strings, an enum, and the required arguments.
const string = (description) => ({
  type: "string",
  description,
});

const id = string("The id of the work.");

const object = (properties, required = []) =>
  required.length === 0
    ? {
        type: "object",
        properties,
      }
    : {
        type: "object",
        properties,
        required,
      };

// Null when `input` matches `schema`, else a message that names the argument.
export function checkInput(schema, input) {
  for (const name of schema.required ?? []) {
    if (input[name] === undefined) {
      return `The argument ${name} is required.`;
    }
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    const value = input[name];
    if (value === undefined) {
      continue;
    }
    if (property.type === "string" && typeof value !== "string") {
      return `The argument ${name} must be a string.`;
    }
    if (property.enum && !property.enum.includes(value)) {
      return `The argument ${name} must be one of: ${property.enum.join(", ")}.`;
    }
    if (
      property.type === "array" &&
      !(Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      return `The argument ${name} must be an array of strings.`;
    }
  }
  return null;
}

export function createTools({ request }) {
  const path = (workId, suffix = "") =>
    `/works/${encodeURIComponent(workId)}${suffix}`;
  return [
    {
      name: "assign_work",
      description: "Assigns a work to the engine: POST /works.",
      inputSchema: object(
        {
          id: string("The id of the work, as a slug. Optional."),
          workflow: string("The name of the workflow that the work follows."),
          title: string("The title of the work."),
          description: string("What the work is."),
          dod: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "The DOD of the work, to customize the one of the workflow.",
          },
        },
        ["workflow", "title"],
      ),
      handler: (input) => request("POST", "/works", input),
    },
    {
      name: "decide_work",
      description:
        "Approves or rejects a work that is PROPOSED: POST /works/{id}/decision.",
      inputSchema: object(
        {
          id,
          decision: {
            type: "string",
            enum: ["approve", "reject"],
            description: "approve or reject.",
          },
          reason: string(
            "Why the approver decides so, at most 65,000 characters. Optional: the engine writes it as a comment on the pull request.",
          ),
        },
        ["id", "decision"],
      ),
      handler: ({ id: workId, ...body }) =>
        request("POST", path(workId, "/decision"), body),
    },
    {
      name: "archive_work",
      description:
        "Archives a work that is final and was not approved: POST /works/{id}/archive.",
      inputSchema: object(
        {
          id,
        },
        ["id"],
      ),
      handler: ({ id: workId }) => request("POST", path(workId, "/archive")),
    },
    {
      name: "retry_work",
      description:
        "Retries a work whose last step failed in the engine, such as a push or a merge that GitHub refused: POST /works/{id}/retry.",
      inputSchema: object(
        {
          id,
        },
        ["id"],
      ),
      handler: ({ id: workId }) => request("POST", path(workId, "/retry")),
    },
    {
      name: "get_work",
      description: "Gets the state of a work: GET /works/{id}.",
      inputSchema: object(
        {
          id,
        },
        ["id"],
      ),
      handler: ({ id: workId }) => request("GET", path(workId)),
    },
    {
      name: "list_works",
      description: "Lists the works: GET /works.",
      inputSchema: object({}),
      handler: () => request("GET", "/works"),
    },
  ];
}
