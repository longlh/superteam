import { isSlug } from "./ids.js";

export const DEFAULT_PREFIX = "superteam";

// The path of the config of the project, committed and pushed like the
// workflows (see ADR 18).
export const CONFIG_FILE = ".superteam/.p/config.json";

// The names of the branches of superteam, from the prefix of the project:
// `{prefix}-work/{id}` for a work, `{prefix}-task/{id}/{task}` for a task.
export function createBranchNames(prefix = DEFAULT_PREFIX) {
  const works = `${prefix}-work/`;
  const tasks = `${prefix}-task/`;
  return {
    works,
    tasks,
    work: (id) => `${works}${id}`,
    task: (id, taskId) => `${tasks}${id}/${taskId}`,
    tasksOf: (id) => `${tasks}${id}/`,
    // The id of the work of a branch of a work or of a task, or null.
    workIdOf(branch) {
      for (const start of [works, tasks]) {
        if (branch.startsWith(start)) {
          return branch.slice(start.length).split("/")[0];
        }
      }
      return null;
    },
  };
}

// The prefix of the branches from the text of the config file, or the default
// when there is no file. Throws with the reason when the file is not valid.
export function parseConfig(text) {
  if (text === null) {
    return DEFAULT_PREFIX;
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error(`${CONFIG_FILE} is not valid JSON`);
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${CONFIG_FILE} must be an object`);
  }
  if (config.branchPrefix === undefined) {
    return DEFAULT_PREFIX;
  }
  if (!isSlug(config.branchPrefix)) {
    throw new Error(
      `${CONFIG_FILE}: branchPrefix must be a slug: lowercase letters and digits joined by -`,
    );
  }
  return config.branchPrefix;
}
