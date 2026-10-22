import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { queueFileName } from "./event.js";

const QUEUE_FILE = /^\d{6}\.json$/;
const EVENT_ID = /^[0-9a-f]{64}$/;

// The key of a claim is the id of its event. A file that is not an event has
// no id, so its key is the name of its queue file.
function claimKey(raw, queueName) {
  try {
    const { id } = JSON.parse(raw);
    if (typeof id === "string" && EVENT_ID.test(id)) {
      return id;
    }
  } catch {
    // Not JSON: the loop sends it to the DLQ.
  }
  return queueName.replace(/\.json$/, "");
}

export function createQueue(paths) {
  async function queueNames() {
    const names = await readdir(paths.queue);
    return names.filter((name) => QUEUE_FILE.test(name)).sort();
  }

  return {
    // Writes the event to `tmp/` and moves it into the queue, so a half
    // written file is never in the queue. An existing file is overwritten.
    async put(event) {
      const temporary = path.join(paths.tmp, `${event.id}.json`);
      await writeFile(temporary, JSON.stringify(event, null, 2));
      await rename(
        temporary,
        path.join(paths.queue, queueFileName(event.order)),
      );
    },

    async maxOrder() {
      const names = await queueNames();
      return names.length === 0 ? 0 : Number.parseInt(names.at(-1), 10);
    },

    // Moves the file with the smallest order to `claim/`. Gives `null` when
    // the queue is empty, else `{ key, raw }`.
    async claimNext() {
      const [name] = await queueNames();
      if (name === undefined) {
        return null;
      }
      const file = path.join(paths.queue, name);
      const raw = await readFile(file, "utf8");
      const key = claimKey(raw, name);
      await rename(file, path.join(paths.claim, `${key}.json`));
      return {
        key,
        raw,
      };
    },

    async listClaims() {
      const names = (await readdir(paths.claim)).filter((name) =>
        name.endsWith(".json"),
      );
      return Promise.all(
        names.sort().map(async (name) => ({
          key: name.replace(/\.json$/, ""),
          raw: await readFile(path.join(paths.claim, name), "utf8"),
        })),
      );
    },

    async deleteClaim(key) {
      await rm(path.join(paths.claim, `${key}.json`), {
        force: true,
      });
    },

    // Writes `content` (an event or the raw text) to `dlq/{key}.json`, then
    // deletes the claim.
    async toDlq(key, content) {
      const text =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      await writeFile(path.join(paths.dlq, `${key}.json`), text);
      await rm(path.join(paths.claim, `${key}.json`), {
        force: true,
      });
    },

    async ensureFolders() {
      await Promise.all(
        [paths.queue, paths.claim, paths.dlq, paths.tmp].map((folder) =>
          mkdir(folder, {
            recursive: true,
          }),
        ),
      );
    },

    async clearTmp() {
      const names = await readdir(paths.tmp);
      await Promise.all(
        names.map((name) =>
          rm(path.join(paths.tmp, name), {
            force: true,
          }),
        ),
      );
    },
  };
}
