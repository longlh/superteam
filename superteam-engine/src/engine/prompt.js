import { fileURLToPath } from "node:url";
import { createBranchNames } from "../lib/storage/branches.js";
import { issuesBefore, limitationsOf, ranId } from "./loops.js";
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

// A task of a group gets the issues of the gates before it in the group, from
// the last task of each gate that ran (see ADR 19).
function gateIssues(task, tasks) {
  return section(
    "Issues of the gates before:",
    issueLines(issuesBefore(task, tasks), (issue) => `${issue.gate}: not met`),
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

// The groups that a task depends on from outside, directly or through other
// tasks.
function groupsBefore(task, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set();
  const groups = new Set();
  const next = [...(task.dependOn ?? [])];
  while (next.length > 0) {
    const before = byId.get(next.pop());
    if (before === undefined || seen.has(before.id)) {
      continue;
    }
    seen.add(before.id);
    if (before.group !== undefined && before.group !== task.group) {
      groups.add(before.group);
    }
    next.push(...(before.dependOn ?? []));
  }
  return groups;
}

function workerParts({ work, task, tasks, artifacts }) {
  const dependOn = (task.dependOn ?? []).map((id) => ranId(id, tasks));
  return [
    task.instruction,
    `Work: ${work.title}`,
    work.description,
    section("DOD of the work:", numbered(work.dod ?? [])),
    section("DOD of the task:", numbered(task.dod ?? [])),
    gateIssues(task, tasks ?? []),
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
