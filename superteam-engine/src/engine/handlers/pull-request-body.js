function checklist(items, checked) {
  return items
    .map((item, i) => `- [${checked?.[i] === true ? "x" : " "}] ${item}\n`)
    .join("");
}

// The description of the pull request of a work: the summary, then the DOD of
// the work and of each task that has one, with its checklist.
export function renderPullRequestBody({ summary, work, tasks }) {
  let body = `${summary}\n\n## Work DOD\n\n${checklist(work.dod ?? [], work.dodChecklist)}`;
  for (const task of tasks) {
    if ((task.dod ?? []).length > 0) {
      body += `\n## Task \`${task.id}\` DOD\n\n${checklist(task.dod, task.dodChecklist)}`;
    }
  }
  return body;
}
