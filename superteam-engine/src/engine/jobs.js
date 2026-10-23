import { jobSchema } from "../lib/storage/schemas.js";
import { jobId } from "../lib/storage/ids.js";
import { buildPrompt } from "./prompt.js";

const MERGER_TIMEOUT = 720;

function describe({ kind, work, task }) {
  switch (kind) {
    case "worker":
      return {
        role: task.assignee,
        timeout: task.timeout,
        schema: jobSchema("TASK"),
        target: "task",
        targetIds: [task.id],
      };
    case "task-merger":
      return {
        role: "task-merger",
        timeout: MERGER_TIMEOUT,
        schema: jobSchema("TASK"),
        target: "merge",
        targetIds: (task.dependOn ?? []).slice(1),
      };
    case "work-merger":
      return {
        role: "work-merger",
        timeout: MERGER_TIMEOUT,
        schema: jobSchema("WORK"),
        target: "work",
        targetIds: [work.id],
      };
    default:
      throw new Error(`unknown job kind ${kind}`);
  }
}

export function buildJob({
  kind,
  work,
  task,
  tasks,
  workdir,
  artifacts = [],
  branches,
}) {
  const { role, timeout, schema, target, targetIds } = describe({
    kind,
    work,
    task,
  });
  return {
    id: jobId({
      workId: work.id,
      taskId: task?.id,
      kind,
    }),
    role,
    timeout,
    workdir,
    schema,
    instruction: {
      target,
      targetIds,
      prompt: buildPrompt({
        kind,
        work,
        task,
        tasks,
        artifacts,
        branches,
      }),
    },
  };
}
