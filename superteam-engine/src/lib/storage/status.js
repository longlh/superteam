export function taskStatus(task, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependNotDone = (task.dependOn ?? []).filter((id) => {
    const dep = byId.get(id);
    return !(dep && dep.completed && !dep.error);
  });
  if (dependNotDone.length > 0) {
    return "PENDING";
  }
  if (!task.completed) {
    return "IN_PROGRESS";
  }
  return task.error ? "FAILED" : "DONE";
}

export function workStatus({ work, tasks, proposed }) {
  if (work.error) {
    return "FAILED";
  }
  if (proposed) {
    return "DONE";
  }
  if (tasks.length === 0) {
    return "OPEN";
  }
  const completed = tasks.filter((t) => t.completed).length;
  return tasks.length > completed ? "IN_PROGRESS" : "DONE";
}

const APPROVAL = {
  open: "PROPOSED",
  merged: "APPROVED",
  closed: "REJECTED",
};

export function approvalStatus(pr) {
  if (!pr) {
    return "DRAFT";
  }
  return APPROVAL[pr.state] ?? "DRAFT";
}
