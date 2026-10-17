import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createQueue } from "./queue.js";
import { ensurePaths, getPaths } from "./paths.js";
import { eventId } from "./event.js";

async function setup() {
  const paths = getPaths(await mkdtemp(path.join(tmpdir(), "engineloop-q-")));
  await ensurePaths(paths);
  return {
    paths,
    queue: createQueue(paths),
  };
}

const put = (paths, name, text) =>
  writeFile(path.join(paths.queue, name), text);
const id = eventId("2026-01-01T00:00:00.000Z", 1);

test("put writes the file named by the order, with no tmp file left, and overwrites", async () => {
  const { paths, queue } = await setup();
  const event = {
    order: 3,
    id: "x",
    payload: {},
    attempts: 1,
    errors: [],
  };
  await queue.put(event);
  const file = path.join(paths.queue, "000003.json");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), event);
  assert.deepEqual(await readdir(paths.tmp), []);
  await queue.put({
    ...event,
    attempts: 2,
  });
  assert.equal(JSON.parse(await readFile(file, "utf8")).attempts, 2);
});

test("list is in order and ignores other files, and maxOrder is 0 when empty", async () => {
  const { paths, queue } = await setup();
  assert.equal(await queue.maxOrder(), 0);
  await put(paths, "000010.json", "{}");
  await put(paths, "000002.json", "{}");
  await put(paths, "notes.txt", "x");
  assert.deepEqual(await queue.list(), ["000002.json", "000010.json"]);
  assert.equal(await queue.maxOrder(), 10);
});

test("claimNext moves the lowest event, and names the claim by the id", async () => {
  const { paths, queue } = await setup();
  assert.equal(await queue.claimNext(), null);
  await put(
    paths,
    "000002.json",
    JSON.stringify({
      id: "short",
    }),
  );
  await put(
    paths,
    "000001.json",
    JSON.stringify({
      id,
    }),
  );
  const claim = await queue.claimNext();
  assert.equal(claim.name, id);
  assert.deepEqual(JSON.parse(claim.raw), {
    id,
  });
  assert.deepEqual(await queue.list(), ["000002.json"]);
  assert.deepEqual(await queue.listClaims(), [id]);
});

test("a broken event is claimed by its queue file name", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000003.json", "{not json");
  assert.equal((await queue.claimNext()).name, "000003");
  assert.deepEqual(await queue.listClaims(), ["000003"]);
});

test("readClaim and deleteClaim", async () => {
  const { paths, queue } = await setup();
  await put(
    paths,
    "000001.json",
    JSON.stringify({
      id,
    }),
  );
  const { name } = await queue.claimNext();
  assert.deepEqual(JSON.parse(await queue.readClaim(name)), {
    id,
  });
  await queue.deleteClaim(name);
  assert.deepEqual(await queue.listClaims(), []);
});

test("toDlq moves the claim, or writes the given event and deletes the claim", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000001.json", "{}");
  const { name } = await queue.claimNext();
  await queue.toDlq(name);
  assert.deepEqual(await queue.listClaims(), []);
  assert.deepEqual(await readdir(paths.dlq), [`${name}.json`]);

  await put(
    paths,
    "000002.json",
    JSON.stringify({
      id,
    }),
  );
  await queue.claimNext();
  const event = {
    order: 2,
    errors: [
      {
        attempt: 1,
        error: "boom",
        time: "t",
      },
    ],
  };
  await queue.toDlq(id, event);
  assert.deepEqual(await queue.listClaims(), []);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(paths.dlq, `${id}.json`), "utf8")),
    event,
  );
  assert.deepEqual(await readdir(paths.tmp), []);
});
