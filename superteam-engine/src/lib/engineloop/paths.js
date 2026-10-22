import path from "node:path";

// The four folders of the engine loop, under `.superteam/.r/engineloop/`.
export function createPaths(baseDir) {
  const root = path.join(baseDir, ".superteam", ".r", "engineloop");
  return {
    root,
    queue: path.join(root, "queue"),
    claim: path.join(root, "claim"),
    dlq: path.join(root, "dlq"),
    tmp: path.join(root, "tmp"),
  };
}
