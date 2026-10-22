import { createHash, randomInt } from "node:crypto";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function isSlug(value) {
  return typeof value === "string" && value.length <= 63 && SLUG.test(value);
}

export function newWorkId() {
  let id = "";
  for (let i = 0; i < 8; i += 1) {
    id += ALPHABET[randomInt(ALPHABET.length)];
  }
  return id;
}

export function jobId({ workId, taskId, kind }) {
  if (kind === "work-merger") {
    return `${workId}/work-merger`;
  }
  return `${workId}/${taskId}/${kind}`;
}

export function parseJobId(id) {
  const parts = id.split("/");
  if (parts.length === 2) {
    return {
      workId: parts[0],
      kind: parts[1],
    };
  }
  return {
    workId: parts[0],
    taskId: parts[1],
    kind: parts[2],
  };
}

export function artifactId({ workId, taskId, createdAt, index }) {
  return createHash("sha256")
    .update(`${workId}:${taskId}:${createdAt}:${index}`)
    .digest("hex");
}
