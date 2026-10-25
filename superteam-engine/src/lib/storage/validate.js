import { isSlug } from "./ids.js";

// In minutes: the largest delay of setTimeout is 2^31 - 1 ms.
const MAX_TIMEOUT = Math.floor((2 ** 31 - 1) / 60000);

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function validateAssignBody(body) {
  if (!isObject(body)) {
    return "body must be an object";
  }
  if (!isSlug(body.workflow)) {
    return "workflow must be a slug";
  }
  if (typeof body.title !== "string" || body.title === "") {
    return "title must be a non-empty string";
  }
  if (body.id !== undefined && !isSlug(body.id)) {
    return "id must be a slug";
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    return "description must be a string";
  }
  if (body.dod !== undefined && !isStringArray(body.dod)) {
    return "dod must be an array of strings";
  }
  return null;
}

function validateStep(step, inLoop = false) {
  if (!isObject(step)) {
    return "a step must be an object";
  }
  if (!isSlug(step.name)) {
    return "step name must be a slug";
  }
  const at = `step ${step.name}`;
  if (step.dependOn !== undefined && !isStringArray(step.dependOn)) {
    return `${at}: dependOn must be an array of strings`;
  }
  if (step.dod !== undefined && !isStringArray(step.dod)) {
    return `${at}: dod must be an array of strings`;
  }
  if (!inLoop && step.gate !== undefined) {
    return `${at}: gate is only for a step of a loop`;
  }
  if (step.gate !== undefined && typeof step.gate !== "boolean") {
    return `${at}: gate must be a boolean`;
  }
  if (step.gate === true && !(step.dod?.length > 0)) {
    return `${at}: a gate has a non-empty dod`;
  }
  if (!isSlug(step.role)) {
    return `${at}: role must be a slug`;
  }
  for (const field of ["description", "instruction"]) {
    if (step[field] !== undefined && typeof step[field] !== "string") {
      return `${at}: ${field} must be a string`;
    }
  }
  if (
    step.timeout !== undefined &&
    !(
      Number.isInteger(step.timeout) &&
      step.timeout > 0 &&
      step.timeout <= MAX_TIMEOUT
    )
  ) {
    return `${at}: timeout must be an integer from 1 to ${MAX_TIMEOUT}`;
  }
  return null;
}

// The steps of a loop are a straight chain: one step with no dependency, then
// each step depends on the one before it.
function isChain(steps) {
  const next = new Map();
  let first;
  for (const step of steps) {
    const deps = step.dependOn ?? [];
    if (deps.length === 0) {
      if (first !== undefined) {
        return false;
      }
      first = step.name;
    } else if (deps.length > 1 || next.has(deps[0])) {
      return false;
    } else {
      next.set(deps[0], step.name);
    }
  }
  let count = 0;
  for (let name = first; name !== undefined; name = next.get(name)) {
    count += 1;
    if (count > steps.length) {
      return false;
    }
  }
  return count === steps.length;
}

function validateLoop(group) {
  if (!isSlug(group.name)) {
    return "step name must be a slug";
  }
  const at = `step ${group.name}`;
  if (group.dependOn !== undefined && !isStringArray(group.dependOn)) {
    return `${at}: dependOn must be an array of strings`;
  }
  if (group.gate !== undefined) {
    return `${at}: gate is only for a step of a loop`;
  }
  if (
    group.description !== undefined &&
    typeof group.description !== "string"
  ) {
    return `${at}: description must be a string`;
  }
  if (["role", "instruction", "dod", "timeout"].some((f) => f in group)) {
    return `${at}: a loop group has no role, instruction, dod or timeout`;
  }
  const { loop } = group;
  const maxRounds = isObject(loop) ? loop.maxRounds : undefined;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 10) {
    return `${at}: maxRounds must be an integer from 1 to 10`;
  }
  if (!Array.isArray(loop.steps) || loop.steps.length === 0) {
    return `${at}: loop steps must be a non-empty array`;
  }
  for (const step of loop.steps) {
    if (isObject(step) && step.loop !== undefined) {
      return `${at}: a loop has no loop inside it`;
    }
    const reason = validateStep(step, true);
    if (reason) {
      return reason;
    }
  }
  const names = new Set();
  for (const { name } of loop.steps) {
    if (names.has(name)) {
      return `duplicate step name ${name}`;
    }
    names.add(name);
  }
  if (!isChain(loop.steps)) {
    return `${at}: the steps of a loop must be a straight chain`;
  }
  if (!loop.steps.some((step) => step.gate === true)) {
    return `${at}: a loop has at least one gate`;
  }
  for (const step of loop.steps) {
    const id = `${group.name}-${step.name}-${maxRounds}`;
    if (!isSlug(id)) {
      return `${at}: the id ${id} of a task must be a slug of at most 63 characters`;
    }
  }
  return null;
}

function findCycle(steps) {
  const deps = new Map(steps.map((s) => [s.name, s.dependOn ?? []]));
  const state = new Map();
  function visit(name) {
    if (state.get(name) === "done") {
      return false;
    }
    if (state.get(name) === "visiting") {
      return true;
    }
    state.set(name, "visiting");
    const cyclic = deps.get(name).some(visit);
    state.set(name, "done");
    return cyclic;
  }
  return steps.some((s) => visit(s.name));
}

export function validateWorkflow(workflow) {
  if (!isObject(workflow)) {
    return "workflow must be an object";
  }
  if (!isSlug(workflow.name)) {
    return "name must be a slug";
  }
  if (typeof workflow.title !== "string" || workflow.title === "") {
    return "title must be a non-empty string";
  }
  if (
    workflow.description !== undefined &&
    typeof workflow.description !== "string"
  ) {
    return "description must be a string";
  }
  for (const field of ["dod", "canApprove"]) {
    if (workflow[field] !== undefined && !isStringArray(workflow[field])) {
      return `${field} must be an array of strings`;
    }
  }
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    return "steps must be a non-empty array";
  }
  for (const step of workflow.steps) {
    const reason =
      step?.loop === undefined ? validateStep(step) : validateLoop(step);
    if (reason) {
      return reason;
    }
  }
  // The names of the steps inside a group are unique in the whole workflow,
  // but only the names of the steps outside, and of the groups, can be
  // depended on from outside.
  const names = new Set();
  for (const { name, loop } of workflow.steps) {
    for (const each of [name, ...(loop?.steps ?? []).map((s) => s.name)]) {
      if (names.has(each)) {
        return `duplicate step name ${each}`;
      }
      names.add(each);
    }
  }
  // A group makes the tasks {group}-{step}-{round}, which must not take the id
  // of another task, or the name of another group.
  const ids = new Set();
  for (const { name, loop } of workflow.steps) {
    const own = loop === undefined ? [] : [name];
    for (let round = 1; round <= (loop?.maxRounds ?? 0); round += 1) {
      own.push(...loop.steps.map((inner) => `${name}-${inner.name}-${round}`));
    }
    for (const id of loop === undefined ? [name] : own) {
      if (ids.has(id)) {
        return `duplicate task id ${id}`;
      }
      ids.add(id);
    }
  }
  const outer = new Set(workflow.steps.map((s) => s.name));
  for (const step of workflow.steps) {
    for (const dep of step.dependOn ?? []) {
      if (!outer.has(dep)) {
        return `step ${step.name} depends on unknown step ${dep}`;
      }
    }
  }
  if (findCycle(workflow.steps)) {
    return "steps have a dependency cycle";
  }
  return null;
}
