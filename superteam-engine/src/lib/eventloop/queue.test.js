import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createQueue } from "./queue.js";
import { ensurePaths, getPaths } from "./paths.js";
import { sha256 } from "./event.js";

async function setup() {
  const paths = getPaths(await mkdtemp(path.join(tmpdir(), "queue-")));
  await ensurePaths(paths);
  return { paths, queue: createQueue(paths) };
}

const put = (paths, file, content) =>
  writeFile(path.join(paths.queue, file), content);

test("the list is in order, and ignores other files", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000010.json", "{}");
  await put(paths, "000002.json", "{}");
  await put(paths, "000000.json", "{}");
  await put(paths, ".DS_Store", "");
  assert.deepEqual(await queue.list(), [
    "000000.json",
    "000002.json",
    "000010.json",
  ]);
  assert.equal(await queue.maxOrder(), 10);
});

test("maxOrder is 0 when the queue is empty", async () => {
  const { queue } = await setup();
  assert.equal(await queue.maxOrder(), 0);
  assert.equal(await queue.claimNext(), null);
});

test("claimNext moves the lowest event, named by its id", async () => {
  const { paths, queue } = await setup();
  const id = sha256("x");
  await put(paths, "000002.json", JSON.stringify({ id: sha256("y") }));
  await put(paths, "000001.json", JSON.stringify({ id }));
  const claim = await queue.claimNext();
  assert.equal(claim.name, id);
  assert.deepEqual(JSON.parse(claim.raw), { id });
  assert.deepEqual(await readdir(paths.queue), ["000002.json"]);
  assert.deepEqual(await queue.listClaims(), [id]);
  assert.equal(await queue.readClaim(id), claim.raw);
});

test("a broken event is claimed under its queue file name", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000003.json", "{not json");
  await put(paths, "000004.json", JSON.stringify({ id: "../escape" }));
  assert.equal((await queue.claimNext()).name, "000003");
  assert.equal((await queue.claimNext()).name, "000004");
});

test("deleteClaim removes the claim", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000001.json", "{}");
  const { name } = await queue.claimNext();
  await queue.deleteClaim(name);
  assert.deepEqual(await queue.listClaims(), []);
});

test("toDlq moves the claim to the DLQ", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000001.json", "{}");
  const { name } = await queue.claimNext();
  await queue.toDlq(name);
  assert.deepEqual(await queue.listClaims(), []);
  assert.deepEqual(await readdir(paths.dlq), [`${name}.json`]);
});

test("put writes the file into the queue, named by the order, with no tmp file left", async () => {
  const { paths, queue } = await setup();
  const event = { order: 3, id: "x", payload: {} };
  await queue.put(event);
  assert.deepEqual(await queue.list(), ["000003.json"]);
  assert.deepEqual(await readdir(paths.tmp), []);
  const saved = JSON.parse(
    await readFile(path.join(paths.queue, "000003.json"), "utf8"),
  );
  assert.deepEqual(saved, event);
});

test("put overwrites an existing 000000.json", async () => {
  const { paths, queue } = await setup();
  await put(paths, "000000.json", "old");
  const event = { order: 0, id: "y", payload: {}, attempts: 1 };
  await queue.put(event);
  const saved = JSON.parse(
    await readFile(path.join(paths.queue, "000000.json"), "utf8"),
  );
  assert.deepEqual(saved, event);
});
