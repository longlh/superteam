import { fileURLToPath } from "node:url";
import { createBranchNames } from "../lib/storage/branches.js";
import { limitationsOf, ranId, roundIssues } from "./loops.js";
import { finalTasks } from "./tasks.js";

const ARTIFACT_SCRIPT = fileURLToPath(
  new URL("../scripts/artifact.js", import.meta.url),
);

function numbered(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function branchList(branches, work, ids) {
  return ids.map((id) => branches.task(work.id, id)).join(", ");
}

function section(title, body) {
  return body ? `${title}\n${body}` : null;
}

function issueLines(issues, head) {
  return issues
    .map(
      (issue) =>
        `- ${head(issue)}: ${issue.failed.join("; ")}` +
        (issue.summary ? `\n  Summary: ${issue.summary}` : ""),
    )
    .join("\n");
}

// The first task of a round after the first gets the issues of the gates of
// the round before (see ADR 19).
function roundBeforeIssues(task, tasks) {
  const before = tasks.find((t) => t.id === task.dependOn?.[0]);
  if (
    task.group === undefined ||
    before?.group !== task.group ||
    before.round !== task.round - 1
  ) {
    return null;
  }
  return section(
    "Issues of the gates of the round before:",
    issueLines(
      roundIssues(task.group, before.round, tasks),
      (issue) => `${issue.gate}: not met`,
    ),
  );
}

// The limitations of the groups in `groups`, or of all of them.
function limitations(tasks, groups) {
  const left = limitationsOf(tasks).filter(
    (limitation) => groups === undefined || groups.has(limitation.group),
  );
  return section(
    "Limitations:",
    left
      .map(({ group, rounds, issues }) =>
        issueLines(
          issues,
          (issue) =>
            `${group} stopped after ${rounds} ${rounds === 1 ? "round" : "rounds"}; the gate ${issue.gate} did not pass`,
        ),
      )
      .join("\n"),
  );
}

// The groups that a task depends on from outside.
function groupsBefore(task, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return new Set(
    (task.dependOn ?? [])
      .map((id) => byId.get(id)?.group)
      .filter((group) => group !== undefined && group !== task.group),
  );
}

function workerParts({ work, task, tasks, artifacts }) {
  const dependOn = (task.dependOn ?? []).map((id) => ranId(id, tasks));
  return [
    task.instruction,
    `Work: ${work.title}`,
    work.description,
    section("DOD of the work:", numbered(work.dod ?? [])),
    section("DOD of the task:", numbered(task.dod ?? [])),
    roundBeforeIssues(task, tasks ?? []),
    limitations(tasks ?? [], groupsBefore(task, tasks ?? [])),
    task.summary
      ? `Summary of the merge of the dependencies:\n${task.summary}`
      : null,
    section(
      "Artifacts of the tasks you depend on:",
      artifacts
        .filter((a) => dependOn.includes(a.task))
        .map((a) => `- from ${a.task}: ${a.content}`)
        .join("\n"),
    ),
    `To create an artifact, run: node ${JSON.stringify(ARTIFACT_SCRIPT)} ${work.id} ${task.id} "<content>"`,
    "Return data.dodChecklist with exactly one boolean for each item of the DOD of the task, in order.",
    "Commit all your changes and artifacts on the current branch before you return.",
  ];
}

function taskMergerParts({ work, task, tasks, branches }) {
  return [
    `Merge the branches of the dependencies of the task ${task.id}.`,
    `Work: ${work.title}`,
    `Branches to merge: ${branchList(
      branches,
      work,
      (task.dependOn ?? []).slice(1).map((id) => ranId(id, tasks)),
    )}`,
  ];
}

function workMergerParts({ work, tasks, branches }) {
  return [
    "Merge the final tasks of the work.",
    `Work: ${work.title}`,
    `Branches to merge: ${branchList(
      branches,
      work,
      finalTasks(tasks).map((t) => ranId(t.id, tasks)),
    )}`,
    section("DOD of the work:", numbered(work.dod ?? [])),
    limitations(tasks),
  ];
}

const PARTS = {
  worker: workerParts,
  "task-merger": taskMergerParts,
  "work-merger": workMergerParts,
};

export function buildPrompt({
  kind,
  work,
  task,
  tasks,
  artifacts = [],
  branches = createBranchNames(),
}) {
  const parts = PARTS[kind];
  if (!parts) {
    throw new Error(`unknown job kind ${kind}`);
  }
  return parts({
    work,
    task,
    tasks,
    artifacts,
    branches,
  })
    .filter((part) => part)
    .join("\n\n");
}
