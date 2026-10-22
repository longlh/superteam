import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createFactory } from "./factory.js";
import { createPaths } from "./paths.js";
import { createQueue } from "./queue.js";
import { createClock, withTempDir } from "./testkit.js";

async function setup(dir) {
  const paths = createPaths(dir);
  const queue = createQueue(paths);
  await queue.ensureFolders();
  const factory = createFactory({
    queue,
    now: createClock(),
  });
  return {
    paths,
    queue,
    factory,
  };
}

const payload = {
  type: "work:assign",
  data: {
    id: "w",
  },
};

test("create on an empty queue starts at order 1", async () => {
  await withTempDir(async (dir) => {
    const { factory, paths } = await setup(dir);
    const event = await factory.create(payload);
    assert.equal(event.order, 1);
    assert.equal(event.attempts, 0);
    assert.deepEqual(event.errors, []);
    assert.deepEqual(event.payload, payload);
    assert.equal(
      event.id,
      createHash("sha256").update(`${event.createdAt}:1`).digest("hex"),
    );
    const file = path.join(paths.queue, "000001.json");
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), event);
    assert.deepEqual(await readdir(paths.tmp), []);
  });
});

test("create gives the counter plus one, and setCounter sets it", async () => {
  await withTempDir(async (dir) => {
    const { factory } = await setup(dir);
    factory.setCounter(41);
    assert.equal((await factory.create(payload)).order, 42);
    assert.equal((await factory.create(payload)).order, 43);
  });
});

test("two creates at the same time get two orders", async () => {
  await withTempDir(async (dir) => {
    const { factory, paths } = await setup(dir);
    const events = await Promise.all([
      factory.create(payload),
      factory.create(payload),
    ]);
    assert.deepEqual(events.map((e) => e.order).sort(), [1, 2]);
    assert.equal((await readdir(paths.queue)).length, 2);
  });
});

test("create refuses an invalid payload", async () => {
  await withTempDir(async (dir) => {
    const { factory } = await setup(dir);
    await assert.rejects(
      factory.create({
        type: "",
        data: {},
      }),
      /type/,
    );
  });
});

test("createAtHead gives order 0 and keeps attempts and errors", async () => {
  await withTempDir(async (dir) => {
    const { factory, paths } = await setup(dir);
    const errors = [
      {
        attempt: 1,
        error: "x",
        time: "t",
      },
    ];
    const event = await factory.createAtHead(payload, 1, errors);
    assert.equal(event.order, 0);
    assert.equal(event.attempts, 1);
    assert.deepEqual(event.errors, errors);
    assert.deepEqual(await readdir(paths.queue), ["000000.json"]);
  });
});

test("an order above 999999 throws", async () => {
  await withTempDir(async (dir) => {
    const { factory } = await setup(dir);
    factory.setCounter(999998);
    assert.equal((await factory.create(payload)).order, 999999);
    await assert.rejects(factory.create(payload), /999999/);
  });
});

test("events reach the queue in the order of their numbers, even if the first write is slow", async () => {
  await withTempDir(async (dir) => {
    const { paths, queue } = await setup(dir);
    const landed = [];
    const slowQueue = {
      ...queue,
      async put(event) {
        if (event.order === 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await queue.put(event);
        landed.push(event.order);
      },
    };
    const factory = createFactory({
      queue: slowQueue,
      now: createClock(),
    });
    const events = await Promise.all([
      factory.create(payload),
      factory.create(payload),
      factory.create(payload),
    ]);
    assert.deepEqual(
      events.map((e) => e.order),
      [1, 2, 3],
    );
    assert.deepEqual(landed, [1, 2, 3]);
    assert.equal((await readdir(paths.queue)).length, 3);
  });
});

test("a failed write does not block the next event", async () => {
  await withTempDir(async (dir) => {
    const { queue } = await setup(dir);
    const failing = {
      ...queue,
      async put(event) {
        if (event.order === 1) {
          throw new Error("disk");
        }
        await queue.put(event);
      },
    };
    const factory = createFactory({
      queue: failing,
      now: createClock(),
    });
    const [first, second] = await Promise.allSettled([
      factory.create(payload),
      factory.create(payload),
    ]);
    assert.equal(first.status, "rejected");
    assert.equal(second.value.order, 2);
  });
});
