import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFactory } from "./factory.js";
import { eventId } from "./event.js";
import { ensurePaths, getPaths } from "./paths.js";

const payload = { command: "write", target: "/a/b.txt", src: "hi" };
const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");

async function setup() {
  const paths = getPaths(await mkdtemp(path.join(tmpdir(), "factory-")));
  await ensurePaths(paths);
  return { paths, factory: createFactory({ paths, now: fixedNow }) };
}

test("create gives order, id, createdAt and attempts", async () => {
  const { factory } = await setup();
  const event = factory.create(payload);
  assert.deepEqual(event, {
    order: 1,
    id: eventId("2026-01-01T00:00:00.000Z", 1),
    payload,
    createdAt: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  });
  assert.equal(factory.create(payload).order, 2);
});

test("100 calls at the same time give 100 different orders", async () => {
  const { factory } = await setup();
  const events = await Promise.all(
    Array.from({ length: 100 }, async () => factory.create(payload)),
  );
  assert.equal(new Set(events.map((e) => e.order)).size, 100);
  assert.equal(new Set(events.map((e) => e.id)).size, 100);
});

test("setCounter continues from the given maximum", async () => {
  const { factory } = await setup();
  factory.setCounter(7);
  assert.equal(factory.create(payload).order, 8);
  factory.setCounter(2);
  assert.equal(factory.create(payload).order, 3);
});

test("an explicit order 0 does not use the counter", async () => {
  const { factory } = await setup();
  const event = factory.create(payload, { order: 0, attempts: 2 });
  assert.equal(event.order, 0);
  assert.equal(event.attempts, 2);
  assert.equal(factory.create(payload).order, 1);
});

test("enqueue writes the file into the queue and leaves no tmp file", async () => {
  const { paths, factory } = await setup();
  const event = factory.create(payload);
  await factory.enqueue(event);
  assert.deepEqual(await readdir(paths.queue), ["000001.json"]);
  assert.deepEqual(await readdir(paths.tmp), []);
  const saved = JSON.parse(
    await readFile(path.join(paths.queue, "000001.json"), "utf8"),
  );
  assert.deepEqual(saved, event);
});

test("enqueue overwrites an existing 000000.json", async () => {
  const { paths, factory } = await setup();
  await factory.enqueue(factory.create(payload, { order: 0 }));
  await writeFile(path.join(paths.queue, "000000.json"), "old");
  const event = factory.create(payload, { order: 0, attempts: 1 });
  await factory.enqueue(event);
  const saved = JSON.parse(
    await readFile(path.join(paths.queue, "000000.json"), "utf8"),
  );
  assert.deepEqual(saved, event);
});
