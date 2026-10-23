import { rmdir } from "node:fs/promises";
import { tasksWorktreesDir } from "../../lib/storage/paths.js";

// Removes the folder of the task worktrees of a work once the work has ended.
// It is removed only when it is empty: a folder that is left is kept.
export async function removeTasksFolder(deps, workId) {
  try {
    await rmdir(tasksWorktreesDir(deps.baseDir, workId));
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) {
      throw error;
    }
  }
}
