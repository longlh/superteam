export const MAX_ORDER = 999999;

const valid = {
  valid: true,
};

function invalid(reason) {
  return {
    valid: false,
    reason,
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The name of the queue file of an order: `000001.json`.
export function queueFileName(order) {
  return `${String(order).padStart(6, "0")}.json`;
}

// The loop checks only the shape of the payload, never what is in `data`.
export function validatePayload(payload) {
  if (!isObject(payload)) {
    return invalid("payload must be an object");
  }
  if (typeof payload.type !== "string" || payload.type === "") {
    return invalid("payload.type must be a non-empty string");
  }
  if (!isObject(payload.data)) {
    return invalid("payload.data must be an object");
  }
  return valid;
}

export function validateOrder(order) {
  if (!Number.isInteger(order) || order < 0 || order > MAX_ORDER) {
    return invalid(`order must be an integer from 0 to ${MAX_ORDER}`);
  }
  return valid;
}

function validateError(entry) {
  return (
    isObject(entry) &&
    Number.isInteger(entry.attempt) &&
    entry.attempt >= 1 &&
    typeof entry.error === "string" &&
    typeof entry.time === "string"
  );
}

export function validateEvent(event) {
  if (!isObject(event)) {
    return invalid("event must be an object");
  }
  const order = validateOrder(event.order);
  if (!order.valid) {
    return order;
  }
  if (typeof event.id !== "string" || event.id === "") {
    return invalid("event.id must be a non-empty string");
  }
  const payload = validatePayload(event.payload);
  if (!payload.valid) {
    return payload;
  }
  if (typeof event.createdAt !== "string" || event.createdAt === "") {
    return invalid("event.createdAt must be a non-empty string");
  }
  if (!Number.isInteger(event.attempts) || event.attempts < 0) {
    return invalid("event.attempts must be a non-negative integer");
  }
  if (!Array.isArray(event.errors) || !event.errors.every(validateError)) {
    return invalid("event.errors must be a list of { attempt, error, time }");
  }
  return valid;
}

// Parses the text of a claim. Gives `{ event }`, or `{ reason }` when the
// text is not JSON or the structure is wrong.
export function parseEvent(raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    return {
      reason: `invalid JSON: ${error.message}`,
    };
  }
  const result = validateEvent(event);
  if (!result.valid) {
    return {
      reason: `invalid event: ${result.reason}`,
    };
  }
  return {
    event,
  };
}
