import path from "node:path";

export function p(baseDir) {
  return path.join(baseDir, ".superteam", ".p");
}

export function r(baseDir) {
  return path.join(baseDir, ".superteam", ".r");
}

export function workFile(dir, id) {
  return path.join(p(dir), "works", `${id}.json`);
}

export function workflowFile(dir, name) {
  return path.join(p(dir), "workflows", `${name}.json`);
}

export function taskFile(dir, taskId) {
  return path.join(r(dir), "tasks", `${taskId}.json`);
}

export function artifactsDir(dir, workId) {
  return path.join(p(dir), "artifacts", workId);
}

export function worktreeDir(baseDir, { workId, taskId }) {
  const worktrees = path.join(r(baseDir), "worktrees");
  if (taskId === undefined) {
    return path.join(worktrees, "works", workId);
  }
  return path.join(worktrees, "tasks", workId, taskId);
}

export function agentsDir(baseDir) {
  return path.join(r(baseDir), "agents");
}
