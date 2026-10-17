import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { padOrder } from "./event.js";

const QUEUE_FILE = /^\d{6}\.json$/;
const ID = /^[0-9a-f]{64}$/;

// The file name of a claim: the event id, or the queue file name when the file
// has no usable id (so a broken event can still be claimed).
function claimNameOf(raw, queueFile) {
  try {
    const { id } = JSON.parse(raw);
    if (ID.test(id)) {
      return id;
    }
  } catch {
    // Not valid JSON: use the queue file name.
  }
  return path.basename(queueFile, ".json");
}

// The folders of the queue: the waiting events, the claim, and the DLQ.
// A claim is named without its `.json` extension.
export function createQueue(paths) {
  const claimFile = (name) => path.join(paths.claim, `${name}.json`);

  // Atomic: write to tmp first, then move to `file`, so nobody reads a file
  // that is half written. An existing file is overwritten.
  async function writeAtomic(file, event) {
    const tmpFile = path.join(paths.tmp, `${randomUUID()}.tmp`);
    await writeFile(tmpFile, JSON.stringify(event));
    await rename(tmpFile, file);
  }

  // The queue files, from the lowest `order` to the highest.
  async function list() {
    return (await readdir(paths.queue))
      .filter((f) => QUEUE_FILE.test(f))
      .sort();
  }

  return {
    put: (event) =>
      writeAtomic(
        path.join(paths.queue, `${padOrder(event.order)}.json`),
        event,
      ),

    list,

    // The maximum `order` in the queue, 0 when it is empty.
    async maxOrder() {
      const files = await list();
      return files.length ? Number.parseInt(files.at(-1), 10) : 0;
    },

    // Moves the lowest event from the queue to the claim folder.
    // Returns { name, raw } or null when the queue is empty.
    async claimNext() {
      const [file] = await list();
      if (!file) {
        return null;
      }
      const from = path.join(paths.queue, file);
      const raw = await readFile(from, "utf8");
      const name = claimNameOf(raw, file);
      await rename(from, claimFile(name));
      return {
        name,
        raw,
      };
    },

    async listClaims() {
      const files = await readdir(paths.claim);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5));
    },

    readClaim: (name) => readFile(claimFile(name), "utf8"),

    deleteClaim: (name) => rm(claimFile(name)),

    // Moves a claim to the DLQ. With `event`, the DLQ file holds that event
    // (the one with the last error) and the claim is deleted.
    async toDlq(name, event) {
      const dlqFile = path.join(paths.dlq, `${name}.json`);
      if (!event) {
        return rename(claimFile(name), dlqFile);
      }
      await writeAtomic(dlqFile, event);
      await rm(claimFile(name));
    },
  };
}
