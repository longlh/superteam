import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEngineLoop } from "./index.js";
import { eventId, padOrder } from "./event.js";

const NOTIFICATIONS = ["event:done", "event:retry", "event:error"];

// A loop on a temporary folder. `sleep` only records, and yields to the event
// loop of Node so that the test never spins.
async function setup(options = {}) {
  const baseDir = await mkdtemp(path.join(tmpdir(), "engineloop-i-"));
  const root = path.join(baseDir, ".superteam", ".e");
  const dir = (name) => path.join(root, name);
  const sleeps = [];
  const loop = createEngineLoop({
    baseDir,
    sleep: async (ms) => {
      sleeps.push(ms);
      await new Promise((resolve) => setImmediate(resolve));
    },
    ...options,
  });
  const seen = [];
  for (const name of NOTIFICATIONS) {
    loop.subscribe(name, (data) =>
      seen.push({
        name,
        ...data,
      }),
    );
  }
  const prepare = async () => {
    for (const name of ["queue", "claim", "dlq", "tmp"]) {
      await mkdir(dir(name), {
        recursive: true,
      });
    }
  };
  return {
    baseDir,
    dir,
    sleeps,
    loop,
    seen,
    prepare,
  };
}

// Shuts the loop down when `isDone(seen)` is true after a notification.
async function runUntil(ctx, isDone) {
  for (const name of NOTIFICATIONS) {
    ctx.loop.subscribe(name, () => isDone(ctx.seen) && ctx.loop.shutdown());
  }
  await ctx.loop.start({
    handleSignals: false,
  });
}

const count = (seen, name) => seen.filter((n) => n.name === name).length;
const ls = async (folder) => (await readdir(folder)).sort();
const event = (type = "work:submit", data = {}) => ({
  type,
  data,
});

// A valid event file, for the tests that prepare the folders by hand.
function eventFile(order, payload, attempts = 0) {
  const createdAt = new Date(order * 1000).toISOString();
  return JSON.stringify({
    order,
    id: eventId(createdAt, order),
    payload,
    createdAt,
    attempts,
    errors: [],
  });
}

// Puts valid events in the queue by hand, as if they were left by an earlier
// run: enqueue() needs start() first. Returns the events.
async function seed(ctx, payloads) {
  await ctx.prepare();
  const events = [];
  for (const [i, payload] of payloads.entries()) {
    const raw = eventFile(i + 1, payload);
    await writeFile(
      path.join(ctx.dir("queue"), `${padOrder(i + 1)}.json`),
      raw,
    );
    events.push(JSON.parse(raw));
  }
  return events;
}

test("enqueue before start is rejected", async () => {
  const ctx = await setup();
  await assert.rejects(ctx.loop.enqueue(event()), /start\(\) first/);
});

test("baseDir is required", () => {
  assert.throws(() => createEngineLoop({}), /baseDir is required/);
});

test("an event is processed: its handler gets the event, the claim is deleted, and event:done carries the event and the time", async () => {
  const ctx = await setup();
  const [seeded] = await seed(ctx, [
    event("work:submit", {
      title: "a",
    }),
  ]);
  const got = [];
  ctx.loop.handle("work:submit", async (e) => {
    got.push(e);
  });
  await runUntil(ctx, () => true);
  assert.deepEqual(got, [seeded]);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  const [done] = ctx.seen;
  assert.equal(done.name, "event:done");
  assert.deepEqual(done.event, seeded);
  assert.ok(!Number.isNaN(Date.parse(done.time)));
});

test("the events are processed one at a time, in order", async () => {
  const ctx = await setup();
  await seed(ctx, [
    event("a", {
      n: 1,
    }),
    event("a", {
      n: 2,
    }),
    event("a", {
      n: 3,
    }),
  ]);
  const order = [];
  let running = 0;
  ctx.loop.handle("a", async (e) => {
    running += 1;
    assert.equal(running, 1);
    await new Promise((resolve) => setImmediate(resolve));
    order.push(e.payload.data.n);
    running -= 1;
  });
  await runUntil(ctx, (seen) => seen.length === 3);
  assert.deepEqual(order, [1, 2, 3]);
});

test("a handler fails: the retry is 000000.json with the error, and the loop waits 2^attempts seconds", async () => {
  const ctx = await setup({
    maxAttempts: 3,
  });
  const [seeded] = await seed(ctx, [event()]);
  ctx.loop.handle("work:submit", async () => {
    throw new Error("boom");
  });
  // Stop at the first retry, before the loop picks it up.
  ctx.loop.subscribe("event:retry", () => ctx.loop.shutdown());
  await ctx.loop.start({
    handleSignals: false,
  });

  assert.equal(count(ctx.seen, "event:retry"), 1);
  assert.deepEqual(await ls(ctx.dir("queue")), ["000000.json"]);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
  const retry = JSON.parse(
    await readFile(path.join(ctx.dir("queue"), "000000.json"), "utf8"),
  );
  assert.equal(retry.attempts, 1);
  assert.equal(retry.order, 0);
  assert.deepEqual(retry.payload, seeded.payload);
  assert.notEqual(retry.id, seeded.id);
  assert.deepEqual(
    retry.errors.map((e) => [e.attempt, e.error]),
    [[1, "boom"]],
  );
  assert.deepEqual(ctx.sleeps, []);
});

test("attempts reaches maxAttempts: the DLQ file has the error of every attempt", async () => {
  const ctx = await setup({
    maxAttempts: 3,
  });
  await seed(ctx, [event()]);
  ctx.loop.handle("work:submit", async () => {
    throw new Error("boom");
  });
  await runUntil(ctx, (seen) => count(seen, "event:error") === 1);

  assert.deepEqual(
    ctx.seen.map((n) => n.name),
    ["event:retry", "event:retry", "event:error"],
  );
  assert.deepEqual(
    ctx.seen.map((n) => n.event.attempts),
    [0, 1, 2],
  );
  assert.deepEqual(ctx.sleeps, [2000, 4000]);
  const [dlqFile] = await ls(ctx.dir("dlq"));
  const dead = JSON.parse(
    await readFile(path.join(ctx.dir("dlq"), dlqFile), "utf8"),
  );
  assert.deepEqual(
    dead.errors.map((e) => e.attempt),
    [1, 2, 3],
  );
  assert.deepEqual(ctx.seen.at(-1).event, dead);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
});

test("an error that is not retryable goes to the DLQ at once, without a wait", async () => {
  const ctx = await setup({
    maxAttempts: 3,
  });
  await seed(ctx, [event()]);
  ctx.loop.handle("work:submit", async () => {
    throw Object.assign(new Error("never"), {
      retryable: false,
    });
  });
  await runUntil(ctx, (seen) => count(seen, "event:error") === 1);
  assert.deepEqual(
    ctx.seen.map((n) => n.name),
    ["event:error"],
  );
  assert.deepEqual(ctx.sleeps, []);
  assert.equal((await ls(ctx.dir("dlq"))).length, 1);
});

test("an event with no handler, a wrong structure or broken JSON goes to the DLQ without a retry", async () => {
  const ctx = await setup();
  await seed(ctx, [event("unknown")]);
  await writeFile(path.join(ctx.dir("queue"), "000002.json"), "{not json");
  await writeFile(path.join(ctx.dir("queue"), "000003.json"), '{"a":1}');
  await runUntil(ctx, (seen) => seen.length === 3);
  assert.deepEqual(
    ctx.seen.map((n) => n.name),
    ["event:error", "event:error", "event:error"],
  );
  assert.equal((await ls(ctx.dir("dlq"))).length, 3);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  assert.deepEqual(ctx.sleeps, []);
});

test("a handler can enqueue an event, which is processed after the current one", async () => {
  const ctx = await setup();
  await seed(ctx, [event("first")]);
  const order = [];
  ctx.loop.handle("first", async () => {
    order.push("first");
    await ctx.loop.enqueue(event("second"));
  });
  ctx.loop.handle("second", async () => {
    order.push("second");
  });
  await runUntil(ctx, (seen) => seen.length === 2);
  assert.deepEqual(order, ["first", "second"]);
});

test("start with a claim: it becomes 000000.json, overwrites the old one, and is processed again", async () => {
  const ctx = await setup();
  await ctx.prepare();
  const claimed = JSON.parse(
    eventFile(
      4,
      event("work:submit", {
        n: 4,
      }),
      2,
    ),
  );
  await writeFile(
    path.join(ctx.dir("claim"), `${claimed.id}.json`),
    JSON.stringify(claimed),
  );
  await writeFile(path.join(ctx.dir("queue"), "000000.json"), "half recovered");
  const got = [];
  ctx.loop.handle("work:submit", async (e) => {
    got.push(e);
  });
  await runUntil(ctx, () => true);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].payload, claimed.payload);
  assert.equal(got[0].attempts, 2);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
});

test("the counter starts at the maximum order of the queue, and at 0 when it is empty", async () => {
  const empty = await setup();
  empty.loop.shutdown();
  await empty.loop.start({
    handleSignals: false,
  });
  assert.equal((await empty.loop.enqueue(event())).order, 1);

  const ctx = await setup();
  await seed(ctx, [event(), event(), event()]);
  ctx.loop.shutdown();
  await ctx.loop.start({
    handleSignals: false,
  });
  assert.equal((await ctx.loop.enqueue(event())).order, 4);
});

test("the tmp folder is empty after the start stage", async () => {
  const ctx = await setup();
  await ctx.prepare();
  await writeFile(path.join(ctx.dir("tmp"), "left.tmp"), "from a crash");
  ctx.loop.shutdown();
  await ctx.loop.start({
    handleSignals: false,
  });
  assert.deepEqual(await ls(ctx.dir("tmp")), []);
});

test("a second call of start throws", async () => {
  const ctx = await setup();
  ctx.loop.shutdown();
  await ctx.loop.start({
    handleSignals: false,
  });
  await assert.rejects(
    ctx.loop.start({
      handleSignals: false,
    }),
    /only once/,
  );
});

test("a handler for the same type twice, or after start, throws", async () => {
  const ctx = await setup();
  ctx.loop.handle("a", async () => {});
  assert.throws(() => ctx.loop.handle("a", async () => {}), /already has/);
  ctx.loop.shutdown();
  await ctx.loop.start({
    handleSignals: false,
  });
  assert.throws(() => ctx.loop.handle("b", async () => {}), /before start/);
});

test("shutdown during an iteration: the iteration finishes, and no new one starts", async () => {
  const ctx = await setup();
  await seed(ctx, [event("a"), event("a")]);
  let calls = 0;
  ctx.loop.handle("a", async () => {
    calls += 1;
    ctx.loop.shutdown();
  });
  await ctx.loop.start({
    handleSignals: false,
  });
  assert.equal(calls, 1);
  assert.equal(count(ctx.seen, "event:done"), 1);
  assert.deepEqual(await ls(ctx.dir("queue")), ["000002.json"]);
});

test("the claim folder never has more than one file", async () => {
  const ctx = await setup();
  await seed(ctx, [event("a"), event("a"), event("a")]);
  const sizes = [];
  ctx.loop.handle("a", async () => {
    sizes.push((await ls(ctx.dir("claim"))).length);
  });
  await runUntil(ctx, (seen) => seen.length === 3);
  assert.deepEqual(sizes, [1, 1, 1]);
});

test("without a sleep option the loop waits with a real timer", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "engineloop-i-"));
  const loop = createEngineLoop({
    baseDir,
    pollIntervalMs: 1,
  });
  setTimeout(() => loop.shutdown(), 20);
  await loop.start({
    handleSignals: false,
  });
});
