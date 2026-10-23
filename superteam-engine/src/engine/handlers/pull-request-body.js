function checklist(items, checked) {
  return items
    .map((item, i) => `- [${checked?.[i] === true ? "x" : " "}] ${item}\n`)
    .join("");
}

// What the loop groups left (see ADR 19): for each group, each gate of its
// last round that did not pass, with its failed items and its summary.
function limitations(groups) {
  const parts = groups.map(
    ({ group, rounds, issues }) =>
      `\`${group}\` stopped after ${rounds} ${rounds === 1 ? "round" : "rounds"} with no gate passed.\n` +
      issues
        .map(
          (issue) =>
            `\nThe gate \`${issue.gate}\` did not pass:\n\n${checklist(issue.failed, [])}` +
            (issue.summary ? `\nSummary: ${issue.summary}\n` : ""),
        )
        .join(""),
  );
  return `\n## Limitations\n\n${parts.join("\n")}`;
}

// The description of the pull request of a work: the summary, then the DOD of
// the work, its limitations, and the DOD of each task that has one and was not
// skipped, with its checklist.
export function renderPullRequestBody({ summary, work, tasks }) {
  let body = `${summary}\n\n## Work DOD\n\n${checklist(work.dod ?? [], work.dodChecklist)}`;
  if ((work.limitations ?? []).length > 0) {
    body += limitations(work.limitations);
  }
  for (const task of tasks) {
    if ((task.dod ?? []).length > 0 && !task.skipped) {
      body += `\n## Task \`${task.id}\` DOD\n\n${checklist(task.dod, task.dodChecklist)}`;
    }
  }
  return body;
}
