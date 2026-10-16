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

// The writer applies a write command to the disk.
export function createWriter({ paths }) {
  return {
    // Writes to tmp first, then moves the file to its target. Returns the hash
    // of the bytes. Throws when anything fails, and leaves no tmp file.
    async write(payload, fetchTimeoutMs = 30000) {
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
