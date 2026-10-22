import { listJson, readJson, writeJson } from "../lib/storage/files.js";
import { r, taskFile } from "../lib/storage/paths.js";
import path from "node:path";

const DEFAULT_TIMEOUT = 720;

export function createTasks(work, workflow, now) {
  const at = now.toISOString();
  return workflow.steps.map((step) => ({
    id: step.name,
    title: step.name,
    assignee: step.role,
    timeout: step.timeout ?? DEFAULT_TIMEOUT,
    dependOn: step.dependOn ?? [],
    dod: step.dod ?? [],
    instruction: step.instruction ?? "",
    description: step.description ?? "",
    work: work.id,
    createdAt: at,
    updatedAt: at,
  }));
}

export function createTaskStore(worktreeFolder) {
  return {
    list: () => listJson(path.join(r(worktreeFolder), "tasks")),
    get: (id) => readJson(taskFile(worktreeFolder, id)),
    put: (task) => writeJson(taskFile(worktreeFolder, task.id), task),
  };
}

export function finalTasks(tasks) {
  const depended = new Set(tasks.flatMap((t) => t.dependOn ?? []));
  return tasks.filter((t) => !depended.has(t.id));
}
