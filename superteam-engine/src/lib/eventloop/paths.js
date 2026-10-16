import { mkdir } from "node:fs/promises";
import path from "node:path";

// The folders of the module, all under {baseDir}/.superteam/.w.
export function getPaths(baseDir) {
  const root = path.join(baseDir, ".superteam", ".w");
  return {
    queue: path.join(root, "queue"),
    claim: path.join(root, "claim"),
    dlq: path.join(root, "dlq"),
    tmp: path.join(root, "tmp"),
  };
}

// mkdir -p for every folder. Safe to call many times.
export async function ensurePaths(paths) {
  await Promise.all(
    Object.values(paths).map((dir) => mkdir(dir, { recursive: true })),
  );
}
