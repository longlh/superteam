import { z } from "zod";

const id = z.string().describe("The id of the work.");

export function createTools({ request }) {
  const path = (workId, suffix = "") =>
    `/works/${encodeURIComponent(workId)}${suffix}`;
  return [
    {
      name: "assign_work",
      description: "Assigns a work to the engine: POST /works.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("The id of the work, as a slug. Optional."),
        workflow: z
          .string()
          .describe("The name of the workflow that the work follows."),
        title: z.string().describe("The title of the work."),
        description: z.string().optional().describe("What the work is."),
        dod: z
          .array(z.string())
          .optional()
          .describe(
            "The DOD of the work, to customize the one of the workflow.",
          ),
      },
      handler: (input) => request("POST", "/works", input),
    },
    {
      name: "decide_work",
      description:
        "Approves or rejects a work that is PROPOSED: POST /works/{id}/decision.",
      inputSchema: {
        id,
        decision: z.enum(["approve", "reject"]).describe("approve or reject."),
        reason: z
          .string()
          .optional()
          .describe(
            "Why the approver decides so. Optional: the engine writes it as a comment on the pull request.",
          ),
      },
      handler: ({ id: workId, ...body }) =>
        request("POST", path(workId, "/decision"), body),
    },
    {
      name: "archive_work",
      description:
        "Archives a work that is final and was not approved: POST /works/{id}/archive.",
      inputSchema: {
        id,
      },
      handler: ({ id: workId }) => request("POST", path(workId, "/archive")),
    },
    {
      name: "retry_work",
      description:
        "Retries a work whose last step failed in the engine, such as a push or a merge that GitHub refused: POST /works/{id}/retry.",
      inputSchema: {
        id,
      },
      handler: ({ id: workId }) => request("POST", path(workId, "/retry")),
    },
    {
      name: "get_work",
      description: "Gets the state of a work: GET /works/{id}.",
      inputSchema: {
        id,
      },
      handler: ({ id: workId }) => request("GET", path(workId)),
    },
    {
      name: "list_works",
      description: "Lists the works: GET /works.",
      inputSchema: {},
      handler: () => request("GET", "/works"),
    },
  ];
}
