// The steps of a group are a straight chain, maybe not written in its order.
function inChain(steps) {
  const next = new Map(
    steps.filter((s) => s.dependOn?.length).map((s) => [s.dependOn[0], s]),
  );
  const chain = [steps.find((s) => !s.dependOn?.length)];
  while (next.has(chain.at(-1).name)) {
    chain.push(next.get(chain.at(-1).name));
  }
  return chain;
}

// A loop group of a workflow is unrolled into one step for each of its steps
// and each round, `{group}-{step}-{round}`, in one chain (see ADR 19).
function unrollGroup(group) {
  const steps = inChain(group.loop.steps);
  const unrolled = [];
  let before = group.dependOn ?? [];
  for (let round = 1; round <= group.loop.maxRounds; round += 1) {
    const id = (name) => `${group.name}-${name}-${round}`;
    for (const step of steps) {
      unrolled.push({
        ...step,
        name: id(step.name),
        dependOn: step.dependOn?.length ? step.dependOn.map(id) : before,
        group: group.name,
        round,
      });
    }
    before = [unrolled.at(-1).name];
  }
  return unrolled;
}

export function unrollSteps(steps) {
  const last = new Map();
  const unrolled = [];
  for (const step of steps) {
    if (step.loop === undefined) {
      unrolled.push(step);
      continue;
    }
    const tasks = unrollGroup(step);
    last.set(step.name, tasks.at(-1).name);
    unrolled.push(...tasks);
  }
  if (last.size === 0) {
    return steps;
  }
  return unrolled.map((step) =>
    step.dependOn?.some((dep) => last.has(dep))
      ? {
          ...step,
          dependOn: step.dependOn.map((dep) => last.get(dep) ?? dep),
        }
      : step,
  );
}

// A gate passes when its task is done and every item of its DOD is true.
export function gatePassed(task) {
  return (
    task.gate === true &&
    task.completed === true &&
    !task.error &&
    task.dodChecklist?.length > 0 &&
    task.dodChecklist.every((item) => item === true)
  );
}

// A task of a group is skipped when a gate before it in the group has passed.
// The group is a chain, so the tasks before it are found by its first
// dependency, back to the start of the group.
export function skips(task, tasks) {
  if (task.group === undefined) {
    return false;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let before = byId.get(task.dependOn?.[0]);
  while (before?.group === task.group) {
    if (gatePassed(before)) {
      return true;
    }
    before = byId.get(before.dependOn?.[0]);
  }
  return false;
}

// A skipped task has no branch and no artifacts: it stands for the task that
// ran before it in its group.
export function ranTask(id, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let task = byId.get(id);
  while (task?.skipped) {
    task = byId.get(task.dependOn[0]);
  }
  return task;
}

export function ranId(id, tasks = []) {
  return ranTask(id, tasks)?.id ?? id;
}

// The issue of a gate that ended and did not pass: the items of its DOD that
// are false, and the summary of its worker.
function issueOf(t) {
  if (t.gate !== true || t.completed !== true || t.skipped || gatePassed(t)) {
    return null;
  }
  return {
    gate: t.id,
    failed: (t.dod ?? []).filter((_, i) => t.dodChecklist?.[i] !== true),
    summary: t.summary ?? "",
  };
}

// The issues of a round: one for each gate of the round that ended and did
// not pass.
export function roundIssues(group, round, tasks) {
  return tasks
    .filter((t) => t.group === group && t.round === round)
    .map(issueOf)
    .filter((issue) => issue !== null);
}

// The issues of the gates before a task in its group, from the last task of
// each gate that ran, the oldest first (see ADR 19).
export function issuesBefore(task, tasks) {
  if (task.group === undefined) {
    return [];
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const steps = new Set();
  const issues = [];
  let before = byId.get(task.dependOn?.[0]);
  while (before?.group === task.group) {
    // The id is {group}-{step}-{round}: the same step in another round has the
    // same id without its round.
    const step = before.id.slice(0, before.id.lastIndexOf("-"));
    if (!steps.has(step)) {
      steps.add(step);
      const issue = issueOf(before);
      if (issue !== null) {
        issues.unshift(issue);
      }
    }
    before = byId.get(before.dependOn?.[0]);
  }
  return issues;
}

// What a group left: when all its tasks ended and no gate passed, the issues
// of its last round.
export function limitationsOf(tasks) {
  const groups = [...new Set(tasks.map((t) => t.group))].filter(
    (group) => group !== undefined,
  );
  return groups.flatMap((group) => {
    const own = tasks.filter((t) => t.group === group);
    if (own.some((t) => !t.completed) || own.some(gatePassed)) {
      return [];
    }
    const rounds = Math.max(...own.map((t) => t.round));
    return [
      {
        group,
        rounds,
        issues: roundIssues(group, rounds, tasks),
      },
    ];
  });
}
