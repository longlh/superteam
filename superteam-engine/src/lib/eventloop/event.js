import { createHash } from "node:crypto";
import path from "node:path";

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
function validateRemoteSrc(remoteSrc) {
  if (!isObject(remoteSrc)) return "payload needs src or remoteSrc";
  let url;
  try {
    url = new URL(remoteSrc.url);
  } catch {
    return "remoteSrc.url must be a valid url";
  }
  if (!["file:", "http:", "https:"].includes(url.protocol)) {
    return "remoteSrc.url must be file://, http:// or https://";
  }
  if (remoteSrc.headers !== undefined && !isObject(remoteSrc.headers)) {
    return "remoteSrc.headers must be an object";
  }
  if (remoteSrc.method !== undefined && remoteSrc.method !== "GET") {
    return "remoteSrc.method supports only GET";
  }
  return null;
}

export function validatePayload(payload) {
  if (!isObject(payload)) return "payload must be an object";
  if (payload.command !== "write") return 'payload.command must be "write"';
  if (typeof payload.target !== "string" || !path.isAbsolute(payload.target)) {
    return "payload.target must be an absolute path";
  }
  // `src` wins over `remoteSrc`, so a valid `src` ends the check.
  if (payload.src !== undefined) {
    return typeof payload.src === "string" ? null : "payload.src must be text";
  }
  return validateRemoteSrc(payload.remoteSrc);
}

export function validateEvent(event) {
  if (!isObject(event)) return "event must be an object";
  if (!isCount(event.order) || event.order > MAX_ORDER) {
    return "event.order must be an integer from 0 to 999999";
  }
  if (typeof event.id !== "string") return "event.id must be a string";
  if (typeof event.createdAt !== "string") {
    return "event.createdAt must be a string";
  }
  if (!isCount(event.attempts)) return "event.attempts must be an integer";
  return validatePayload(event.payload);
}
