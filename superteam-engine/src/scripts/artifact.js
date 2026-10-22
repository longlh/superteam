import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artifactId, isSlug } from "../lib/storage/ids.js";
import { artifactsDir } from "../lib/storage/paths.js";

export async function writeArtifacts({
  dir,
  workId,
  taskId,
  contents,
  now = () => new Date(),
}) {
  for (const [name, id] of [
    ["workId", workId],
    ["taskId", taskId],
  ]) {
    if (!isSlug(id)) {
      throw new Error(`${name} must be a slug`);
    }
  }
  const createdAt = now().toISOString();
  const folder = artifactsDir(dir, workId);
  await mkdir(folder, {
    recursive: true,
  });
  const written = [];
  for (const [index, content] of contents.entries()) {
    const id = artifactId({
      workId,
      taskId,
      createdAt,
      index,
    });
    const file = path.join(folder, `${id}.json`);
    const artifact = {
      id,
      task: taskId,
      work: workId,
      createdAt,
      content,
    };
    await writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx",
    });
    written.push(file);
  }
  return written;
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [workId, taskId, ...contents] = process.argv.slice(2);
  try {
    if (contents.length === 0) {
      throw new Error("usage: node artifact.js <workId> <taskId> <content>...");
    }
    const files = await writeArtifacts({
      dir: process.cwd(),
      workId,
      taskId,
      contents,
    });
    console.log(files.join("\n"));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
