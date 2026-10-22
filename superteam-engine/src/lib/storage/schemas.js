const ENTITIES = ["TASK", "WORK"];

export function jobSchema(entity) {
  if (!ENTITIES.includes(entity)) {
    throw new Error(`unknown entity ${entity}`);
  }
  return {
    type: "object",
    properties: {
      summary: {
        type: "string",
      },
      data: {
        type: "object",
        properties: {
          dodChecklist: {
            type: "array",
            items: {
              type: "boolean",
            },
          },
        },
        additionalProperties: false,
      },
    },
    required: ["summary", "data"],
    additionalProperties: false,
  };
}
