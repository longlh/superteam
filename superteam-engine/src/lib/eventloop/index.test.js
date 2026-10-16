import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEventLoop } from "./index.js";
import { eventId, padOrder } from "./event.js";

const NOTIFICATIONS = ["write:done", "write:retry", "write:error"];

// A loop on a temporary folder. `sleep` only records, and yields to the event
// loop of Node so that the test never spins.
async function setup(options = {}) {
  const baseDir = await mkdtemp(path.join(tmpdir(), "eventloop-"));
  const root = path.join(baseDir, ".superteam", ".w");
  const dir = (name) => path.join(root, name);
  const sleeps = [];
  const loop = createEventLoop({
    baseDir,
    sleep: async (ms) => {
      sleeps.push(ms);
      await new Promise((resolve) => setImmediate(resolve));
    },
    ...options,
  });
  const seen = [];
  for (const name of NOTIFICATIONS) {
    loop.subscribe(name, (data) => seen.push({ name, ...data }));
  }
  const prepare = async () => {
    for (const name of ["queue", "claim", "dlq", "tmp"]) {
      await mkdir(dir(name), { recursive: true });
    }
  };
  return {
    baseDir,
    dir,
    sleeps,
    loop,
    seen,
    prepare,
    target: (f) => path.join(baseDir, f),
  };
}

// Starts the loop, and shuts it down when `isDone(seen)` is true.
async function runUntil(ctx, isDone) {
  ctx.loop.subscribe(
    "write:done",
    () => isDone(ctx.seen) && ctx.loop.shutdown(),
  );
  ctx.loop.subscribe(
    "write:retry",
    () => isDone(ctx.seen) && ctx.loop.shutdown(),
  );
  ctx.loop.subscribe(
    "write:error",
    () => isDone(ctx.seen) && ctx.loop.shutdown(),
  );
  await ctx.loop.start({ handleSignals: false });
}

const count = (seen, name) => seen.filter((n) => n.name === name).length;
const writeCmd = (target, src = "content") => ({
  command: "write",
  target,
  src,
});
const ls = async (folder) => (await readdir(folder)).sort();

// A valid event file, for the tests that prepare the folders by hand.
function eventFile(order, payload, attempts = 0) {
  const createdAt = new Date(order * 1000).toISOString();
  return JSON.stringify({
    order,
    id: eventId(createdAt, order),
    payload,
    createdAt,
    attempts,
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

test("enqueue before start throws", async () => {
  const ctx = await setup();
  await assert.rejects(
    ctx.loop.enqueue(writeCmd(ctx.target("out.txt"))),
    /start\(\) first/,
  );
});

test("a write succeeds", async () => {
  const ctx = await setup();
  const target = ctx.target("out.txt");
  const [event] = await seed(ctx, [writeCmd(target, "hello")]);
  await runUntil(ctx, () => true);
  assert.equal(await readFile(target, "utf8"), "hello");
  assert.deepEqual(await ls(ctx.dir("claim")), []);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  const [done] = ctx.seen;
  assert.equal(done.name, "write:done");
  assert.deepEqual(done.event, event);
  assert.match(done.hash, /^[0-9a-f]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(done.time)));
});

test("events are written in order", async () => {
  const ctx = await setup();
  const target = ctx.target("out.txt");
  await seed(
    ctx,
    ["1", "2", "3"].map((text) => writeCmd(target, text)),
  );
  await runUntil(ctx, (seen) => seen.length === 3);
  assert.deepEqual(
    ctx.seen.map((n) => n.event.order),
    [1, 2, 3],
  );
  assert.equal(await readFile(target, "utf8"), "3");
});

test("a write fails: the retry is 000000.json, and the loop waits 2^attempts seconds", async () => {
  const ctx = await setup({ maxAttempts: 3 });
  // The parent of the target is a file, so every write fails.
  await writeFile(ctx.target("blocker"), "a file");
  const [event] = await seed(ctx, [writeCmd(ctx.target("blocker/out.txt"))]);

  // Stop at the first retry, before the loop picks it up.
  ctx.loop.subscribe("write:retry", () => ctx.loop.shutdown());
  await ctx.loop.start({ handleSignals: false });

  assert.equal(count(ctx.seen, "write:retry"), 1);
  assert.deepEqual(await ls(ctx.dir("queue")), ["000000.json"]);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
  const retry = JSON.parse(
    await readFile(path.join(ctx.dir("queue"), "000000.json"), "utf8"),
  );
  assert.equal(retry.attempts, 1);
  assert.equal(retry.order, 0);
  assert.deepEqual(retry.payload, event.payload);
  assert.notEqual(retry.id, event.id);
  assert.deepEqual(ctx.sleeps, []);
});

test("attempts reaches maxAttempts: the event is in the DLQ", async () => {
  const ctx = await setup({ maxAttempts: 3 });
  await writeFile(ctx.target("blocker"), "a file");
  await seed(ctx, [writeCmd(ctx.target("blocker/out.txt"))]);
  await runUntil(ctx, (seen) => count(seen, "write:error") === 1);

  assert.deepEqual(
    ctx.seen.map((n) => n.name),
    ["write:retry", "write:retry", "write:error"],
  );
  assert.deepEqual(
    ctx.seen.map((n) => n.event.attempts),
    [0, 1, 2],
  );
  assert.deepEqual(ctx.sleeps, [2000, 4000]);
  assert.equal((await ls(ctx.dir("dlq"))).length, 1);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
});

test("a bad event goes to the DLQ without a retry", async () => {
  const ctx = await setup();
  await ctx.prepare();
  await writeFile(path.join(ctx.dir("queue"), "000001.json"), "{not json");
  await writeFile(path.join(ctx.dir("queue"), "000002.json"), '{"a":1}');
  await writeFile(
    path.join(ctx.dir("queue"), "000003.json"),
    eventFile(3, { command: "delete", target: "/x" }),
  );
  await runUntil(ctx, (seen) => count(seen, "write:error") === 3);

  assert.equal(count(ctx.seen, "write:retry"), 0);
  assert.equal((await ls(ctx.dir("dlq"))).length, 3);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  assert.deepEqual(ctx.sleeps, []);
});

test("an abandoned claim found by the loop goes to the DLQ", async () => {
  const ctx = await setup();
  await seed(ctx, [
    writeCmd(ctx.target("a.txt")),
    writeCmd(ctx.target("b.txt")),
  ]);
  // After the first write, something leaves a file in the claim folder.
  let dropped = false;
  ctx.loop.subscribe("write:done", async () => {
    if (dropped) return;
    dropped = true;
    await writeFile(path.join(ctx.dir("claim"), "abandoned.json"), "{}");
  });
  await runUntil(ctx, (seen) => seen.length === 2);

  assert.deepEqual(await ls(ctx.dir("dlq")), ["abandoned.json"]);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
  assert.equal(count(ctx.seen, "write:done"), 2);
});

test("start with a claim: it becomes 000000.json and overwrites the old one", async () => {
  const ctx = await setup();
  await ctx.prepare();
  const payload = writeCmd(ctx.target("out.txt"), "recovered");
  const claimed = JSON.parse(eventFile(4, payload, 2));
  await writeFile(
    path.join(ctx.dir("claim"), `${claimed.id}.json`),
    JSON.stringify(claimed),
  );
  await writeFile(path.join(ctx.dir("queue"), "000000.json"), "half recovered");

  ctx.loop.shutdown(); // only the start stage runs
  await ctx.loop.start({ handleSignals: false });

  assert.deepEqual(await ls(ctx.dir("claim")), []);
  assert.deepEqual(await ls(ctx.dir("queue")), ["000000.json"]);
  const head = JSON.parse(
    await readFile(path.join(ctx.dir("queue"), "000000.json"), "utf8"),
  );
  assert.equal(head.order, 0);
  assert.equal(head.attempts, 2);
  assert.deepEqual(head.payload, payload);
});

test("the counter starts at the maximum order of the queue", async () => {
  const ctx = await setup();
  await ctx.prepare();
  const payload = writeCmd(ctx.target("out.txt"));
  for (const order of [3, 7]) {
    await writeFile(
      path.join(ctx.dir("queue"), `${padOrder(order)}.json`),
      eventFile(order, payload),
    );
  }
  ctx.loop.shutdown();
  await ctx.loop.start({ handleSignals: false });
  const event = await ctx.loop.enqueue(payload);
  assert.equal(event.order, 8);
  assert.ok((await ls(ctx.dir("queue"))).includes("000008.json"));
});

test("the counter starts at 0 when the queue is empty", async () => {
  const ctx = await setup();
  ctx.loop.shutdown();
  await ctx.loop.start({ handleSignals: false });
  const event = await ctx.loop.enqueue(writeCmd(ctx.target("out.txt")));
  assert.equal(event.order, 1);
  assert.deepEqual(await ls(ctx.dir("queue")), ["000001.json"]);
});

test("a shutdown during an iteration finishes it, and no new one starts", async () => {
  const ctx = await setup();
  await seed(ctx, [
    writeCmd(ctx.target("a.txt"), "a"),
    writeCmd(ctx.target("b.txt"), "b"),
  ]);
  ctx.loop.subscribe("write:done", () => ctx.loop.shutdown());
  await ctx.loop.start({ handleSignals: false });

  assert.equal(await readFile(ctx.target("a.txt"), "utf8"), "a");
  await assert.rejects(readFile(ctx.target("b.txt")));
  assert.deepEqual(await ls(ctx.dir("queue")), ["000002.json"]);
  assert.deepEqual(await ls(ctx.dir("claim")), []);
});

test("an empty queue waits pollIntervalMs", async () => {
  const ctx = await setup({ pollIntervalMs: 1000 });
  setTimeout(() => ctx.loop.shutdown(), 20);
  await ctx.loop.start({ handleSignals: false });
  assert.ok(ctx.sleeps.length > 0);
  assert.ok(ctx.sleeps.every((ms) => ms === 1000));
});

test("the claim folder never has more than one file", async () => {
  const ctx = await setup();
  const sizes = [];
  // The server answers while the event is being processed, so the claim is held.
  const server = http.createServer(async (req, res) => {
    sizes.push((await readdir(ctx.dir("claim"))).length);
    res.end("remote");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    await seed(
      ctx,
      ["a", "b", "c"].map((name) => ({
        command: "write",
        target: ctx.target(`${name}.txt`),
        remoteSrc: { url },
      })),
    );
    await runUntil(ctx, (seen) => seen.length === 3);
    assert.deepEqual(sizes, [1, 1, 1]);
    assert.deepEqual(await ls(ctx.dir("claim")), []);
  } finally {
    server.close();
  }
});

test("createEventLoop needs a baseDir", () => {
  assert.throws(() => createEventLoop({}), /baseDir/);
});

test("start with a claim that is not valid: it goes to the DLQ", async () => {
  const ctx = await setup();
  await ctx.prepare();
  await writeFile(path.join(ctx.dir("claim"), "broken.json"), "{not json");

  ctx.loop.shutdown(); // only the start stage runs
  await ctx.loop.start({ handleSignals: false });

  assert.deepEqual(await ls(ctx.dir("claim")), []);
  assert.deepEqual(await ls(ctx.dir("dlq")), ["broken.json"]);
  assert.deepEqual(await ls(ctx.dir("queue")), []);
  assert.deepEqual(
    ctx.seen.map((n) => n.name),
    ["write:error"],
  );
  assert.equal(ctx.seen[0].event, null);
});

test("SIGTERM and SIGINT shut the loop down, and the handlers are removed", async () => {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    const ctx = await setup();
    const before = process.listenerCount(signal);
    // Emitting the event on `process` runs the handlers without a real signal.
    setTimeout(() => {
      assert.equal(process.listenerCount(signal), before + 1);
      process.emit(signal);
    }, 20);
    await ctx.loop.start();
    assert.equal(process.listenerCount(signal), before);
  }
});
