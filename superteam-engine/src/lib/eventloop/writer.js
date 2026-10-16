import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./event.js";

// The content as bytes: `src` first, then `remoteSrc`.
async function getContent({ src, remoteSrc }, timeoutMs) {
  if (typeof src === "string") {
    return Buffer.from(src);
  }
  const { url, headers, method = "GET" } = remoteSrc;
  if (new URL(url).protocol === "file:") {
    return readFile(fileURLToPath(url));
  }
  const response = await fetch(url, {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} gave ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// An error that a retry cannot fix: the loop sends the event to the DLQ.
function rejected(message) {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

// The `version` of the JSON file at `target`: 0 when the file does not exist,
// and undefined when the file has no readable version.
async function currentVersion(target) {
  let raw;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
  try {
    return JSON.parse(raw).version;
  } catch {
    return undefined;
  }
}

// A write with a `version` is applied only if the file at `target` is at that
// version: otherwise it was built from an old state, and it is stale. A write
// without a `version` is not checked.
async function checkVersion({ target, version }) {
  if (version === undefined) {
    return;
  }
  const current = await currentVersion(target);
  if (current !== version) {
    throw rejected(
      `stale write: ${target} is at version ${current ?? "unknown"}, ` +
        `the write is for version ${version}`,
    );
  }
}

// The writer applies a write command to the disk.
export function createWriter({ paths }) {
  return {
    // Writes to tmp first, then moves the file to its target. Returns the hash
    // of the bytes. Throws when anything fails, and leaves no tmp file. A stale
    // write throws an error with `retryable` false.
    async write(payload, fetchTimeoutMs = 30000) {
      await checkVersion(payload);
      const content = await getContent(payload, fetchTimeoutMs);
      const tmpFile = path.join(paths.tmp, `${randomUUID()}.tmp`);
      try {
        await writeFile(tmpFile, content);
        await mkdir(path.dirname(payload.target), {
          recursive: true,
        });
        await rename(tmpFile, payload.target);
      } catch (error) {
        await rm(tmpFile, {
          force: true,
        });
        if (error.code === "EXDEV") {
          throw new Error(
            `target ${payload.target} on another device is not supported`,
          );
        }
        throw error;
      }
      return sha256(content);
    },
  };
}
