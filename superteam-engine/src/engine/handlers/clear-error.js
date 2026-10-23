import { rm } from "node:fs/promises";
import { errorFile } from "../../lib/storage/paths.js";

// Removes the error of the engine of a work, once a step of the work has
// passed or the work has failed for good (see ADR 16).
export function clearError(deps, workId) {
  return rm(errorFile(deps.baseDir, workId), {
    force: true,
  });
}
