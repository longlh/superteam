import { createHash } from "node:crypto";

export const MAX_ORDER = 999999;

// SHA-256 in hex, of a string or of bytes.
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// The name of the queue file: 1 becomes "000001".
export const padOrder = (order) => String(order).padStart(6, "0");

// The id of an event is the hash of its createdAt and its order.
export const eventId = (createdAt, order) => sha256(`${createdAt}:${order}`);

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;

// Each validator returns an error message, or null when the value is valid.
// The loop reads only `type` and `data`: what is in `data` is for the handler.
export function validatePayload(payload) {
  if (!isObject(payload)) {
    return "payload must be an object";
  }
  if (typeof payload.type !== "string" || payload.type === "") {
    return "payload.type must be a text that is not empty";
  }
  if (!isObject(payload.data)) {
    return "payload.data must be an object";
  }
  return null;
}

// Each entry records one failed attempt: which one, why, and when.
function validateErrors(errors) {
  if (!Array.isArray(errors)) {
    return "event.errors must be an array";
  }
  for (const entry of errors) {
    if (
      !isObject(entry) ||
      !Number.isInteger(entry.attempt) ||
      entry.attempt < 1 ||
      typeof entry.error !== "string" ||
      typeof entry.time !== "string"
    ) {
      return "event.errors must hold { attempt, error, time } entries";
    }
  }
  return null;
}

export function validateEvent(event) {
  if (!isObject(event)) {
    return "event must be an object";
  }
  if (!isCount(event.order) || event.order > MAX_ORDER) {
    return "event.order must be an integer from 0 to 999999";
  }
  if (typeof event.id !== "string") {
    return "event.id must be a string";
  }
  if (typeof event.createdAt !== "string") {
    return "event.createdAt must be a string";
  }
  if (!isCount(event.attempts)) {
    return "event.attempts must be an integer";
  }
  return validateErrors(event.errors) ?? validatePayload(event.payload);
}

// Reads the text of an event file. Returns { event } when it is valid, and
// { error, parsed } when it is not JSON or has a wrong structure.
export function parseEvent(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      error: `invalid JSON: ${error.message}`,
    };
  }
  const error = validateEvent(parsed);
  return error
    ? {
        error,
        parsed,
      }
    : {
        event: parsed,
      };
}
