import { isSlug } from "./ids.js";

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

function validateStep(step) {
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
  for (const field of ["role", "description", "instruction"]) {
    if (step[field] !== undefined && typeof step[field] !== "string") {
      return `${at}: ${field} must be a string`;
    }
  }
  if (
    step.timeout !== undefined &&
    !(Number.isInteger(step.timeout) && step.timeout > 0)
  ) {
    return `${at}: timeout must be a positive integer`;
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
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    return "steps must be a non-empty array";
  }
  for (const step of workflow.steps) {
    const reason = validateStep(step);
    if (reason) {
      return reason;
    }
  }
  const names = new Set();
  for (const { name } of workflow.steps) {
    if (names.has(name)) {
      return `duplicate step name ${name}`;
    }
    names.add(name);
  }
  for (const step of workflow.steps) {
    for (const dep of step.dependOn ?? []) {
      if (!names.has(dep)) {
        return `step ${step.name} depends on unknown step ${dep}`;
      }
    }
  }
  if (findCycle(workflow.steps)) {
    return "steps have a dependency cycle";
  }
  return null;
}
