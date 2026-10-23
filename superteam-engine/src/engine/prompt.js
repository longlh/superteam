import { fileURLToPath } from "node:url";
import { finalTasks } from "./tasks.js";

const ARTIFACT_SCRIPT = fileURLToPath(
  new URL("../scripts/artifact.js", import.meta.url),
);

function numbered(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function branches(work, ids) {
  return ids.map((id) => `tasks/${work.id}/${id}`).join(", ");
}

function section(title, body) {
  return body ? `${title}\n${body}` : null;
}

function workerParts({ work, task, tasks, artifacts }) {
  return [
    task.instruction,
    `Work: ${work.title}`,
    work.description,
    section("DOD of the work:", numbered(work.dod ?? [])),
    section("DOD of the task:", numbered(task.dod ?? [])),
    task.summary
      ? `Summary of the merge of the dependencies:\n${task.summary}`
      : null,
    section(
      "Artifacts of the tasks you depend on:",
      artifacts
        .filter((a) => (task.dependOn ?? []).includes(a.task))
        .map((a) => `- from ${a.task}: ${a.content}`)
        .join("\n"),
    ),
    `To create an artifact, run: node ${JSON.stringify(ARTIFACT_SCRIPT)} ${work.id} ${task.id} "<content>"`,
    "Return data.dodChecklist with exactly one boolean for each item of the DOD of the task, in order.",
    "Commit all your changes and artifacts on the current branch before you return.",
  ];
}

function taskMergerParts({ work, task }) {
  return [
    `Merge the branches of the dependencies of the task ${task.id}.`,
    `Work: ${work.title}`,
    `Branches to merge: ${branches(work, (task.dependOn ?? []).slice(1))}`,
  ];
}

function workMergerParts({ work, tasks }) {
  return [
    "Merge the final tasks of the work.",
    `Work: ${work.title}`,
    `Branches to merge: ${branches(
      work,
      finalTasks(tasks).map((t) => t.id),
    )}`,
    section("DOD of the work:", numbered(work.dod ?? [])),
  ];
}

const PARTS = {
  worker: workerParts,
  "task-merger": taskMergerParts,
  "work-merger": workMergerParts,
};

export function buildPrompt({ kind, work, task, tasks, artifacts = [] }) {
  const parts = PARTS[kind];
  if (!parts) {
    throw new Error(`unknown job kind ${kind}`);
  }
  return parts({
    work,
    task,
    tasks,
    artifacts,
  })
    .filter((part) => part)
    .join("\n\n");
}
