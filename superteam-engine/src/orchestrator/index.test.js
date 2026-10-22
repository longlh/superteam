import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createOrchestrator, handleSignals } from "./index.js";

function setup(options = {}) {
  const calls = [];
  const subscribers = {};
  let resolveStart;
  let rejectStart;
  const startPromise = new Promise((resolve, reject) => {
    resolveStart = resolve;
    rejectStart = reject;
  });
  const publish = (topic, data) => {
    for (const cb of subscribers[topic] ?? []) {
      cb(data);
    }
  };
  const engine = {
    subscribe(topic, cb) {
      calls.push(`subscribe:${topic}`);
      (subscribers[topic] ??= []).push(cb);
      return () => {};
    },
    start() {
      calls.push("engine.start");
      options.onEngineStart?.(publish);
      return startPromise;
    },
    shutdown() {
      calls.push("engine.shutdown");
      resolveStart();
    },
    async reconcile(jobs) {
      calls.push(`engine.reconcile:${JSON.stringify(jobs)}`);
    },
    jobEnded: mock.fn(async () => {}),
    getWork: () => {},
  };
  const agents = {
    run: mock.fn(),
    stopWork: mock.fn(),
    async stopAll() {
      calls.push("agents.stopAll");
    },
    async recover() {
      calls.push("agents.recover");
      return [
        {
          id: "j1",
        },
      ];
    },
  };
  const notifier = {
    send: mock.fn(),
    composeMessage: mock.fn(() => "message"),
  };
  const httpApi = {
    async listen(port) {
      calls.push(`api.listen:${port}`);
      return {
        port,
      };
    },
    async close() {
      calls.push("api.close");
    },
  };
  const git = {
    async hasOrigin() {
      calls.push("git.hasOrigin");
      return options.origin ?? true;
    },
    async checkForge() {
      calls.push("git.checkForge");
      return options.forge ?? true;
    },
  };
  const orchestrator = createOrchestrator({
    baseDir: "/tmp/none",
    port: 4000,
    engine,
    agents,
    notifier,
    httpApi,
    git,
    ...options.extra,
  });
  return {
    calls,
    publish,
    engine,
    agents,
    notifier,
    orchestrator,
    rejectStart,
  };
}

const readyOnStart = (publish) => queueMicrotask(() => publish("engine:ready"));

test("start subscribes, recovers, starts the engine, then reconciles and listens", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  let resolved = false;
  await t.orchestrator.start().then(() => {
    resolved = true;
  });
  assert.equal(resolved, true);
  assert.deepEqual(t.calls, [
    "git.hasOrigin",
    "git.checkForge",
    "subscribe:engine:ready",
    "subscribe:job:run",
    "subscribe:job:stop",
    "agents.recover",
    "engine.start",
    'engine.reconcile:[{"id":"j1"}]',
    "api.listen:4000",
  ]);
  await t.orchestrator.shutdown();
});

test("start rejects with a clear message when origin is missing, before anything starts", async () => {
  const t = setup({
    origin: false,
  });
  await assert.rejects(
    t.orchestrator.start(),
    /no git remote named origin: add one with `git remote add origin <url>`/,
  );
  assert.deepEqual(t.calls, ["git.hasOrigin"]);
});

test("start rejects with a clear message when gh is not signed in, before anything starts", async () => {
  const t = setup({
    forge: false,
  });
  await assert.rejects(
    t.orchestrator.start(),
    /gh is not signed in to GitHub: run `gh auth login`/,
  );
  assert.deepEqual(t.calls, ["git.hasOrigin", "git.checkForge"]);
});

test("start waits for engine:ready before reconcile and listen", async () => {
  let publishReady;
  const t = setup({
    onEngineStart: (publish) => {
      publishReady = () => publish("engine:ready");
    },
  });
  const started = t.orchestrator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!t.calls.some((c) => c.startsWith("engine.reconcile")));
  assert.ok(!t.calls.some((c) => c.startsWith("api.listen")));
  publishReady();
  await started;
  assert.ok(t.calls.includes("api.listen:4000"));
  await t.orchestrator.shutdown();
});

test("start rejects when the engine fails before ready", async () => {
  const t = setup();
  const started = t.orchestrator.start();
  await new Promise((resolve) => setImmediate(resolve));
  t.rejectStart(new Error("boom"));
  await assert.rejects(started, /boom/);
});

test("done rejects when the engine stops with an error after it is ready", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  await t.orchestrator.start();
  t.rejectStart(new Error("the loop broke"));
  await assert.rejects(t.orchestrator.done, /the loop broke/);
});

test("subscribe gives a topic of the engine to a guarded callback", async () => {
  const error = mock.method(console, "error", () => {});
  try {
    const t = setup();
    const seen = [];
    t.orchestrator.subscribe("event:error", (data) => {
      seen.push(data);
      throw new Error("the callback broke");
    });
    t.publish("event:error", {
      error: "boom",
    });
    assert.deepEqual(seen, [
      {
        error: "boom",
      },
    ]);
    assert.equal(error.mock.calls.length, 1);
  } finally {
    error.mock.restore();
  }
});

test("job:run runs the agent and the end goes to engine.jobEnded", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  await t.orchestrator.start();
  const job = {
    id: "j2",
  };
  t.publish("job:run", job);
  assert.equal(t.agents.run.mock.calls.length, 1);
  assert.equal(t.agents.run.mock.calls[0].arguments[0], job);
  t.agents.run.mock.calls[0].arguments[1]({
    ok: true,
  });
  assert.deepEqual(t.engine.jobEnded.mock.calls[0].arguments, [
    {
      ok: true,
    },
  ]);
  await t.orchestrator.shutdown();
});

test("job:stop stops the work", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  await t.orchestrator.start();
  t.publish("job:stop", {
    workId: "w1",
  });
  assert.deepEqual(t.agents.stopWork.mock.calls[0].arguments, ["w1"]);
  await t.orchestrator.shutdown();
});

test("a subscription topic sends the composed message", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
    extra: {
      subscriptions: [
        {
          topic: "event:done",
          addon: "notifier",
          env: {},
        },
      ],
    },
  });
  await t.orchestrator.start();
  const event = {
    id: "e1",
  };
  t.publish("event:done", event);
  assert.equal(t.calls.includes("subscribe:event:done"), true);
  const compose = t.notifier.send.mock.calls[0].arguments[0];
  assert.equal(compose(), "message");
  assert.deepEqual(t.notifier.composeMessage.mock.calls[0].arguments, [
    event,
    {
      getWork: t.engine.getWork,
    },
  ]);
  await t.orchestrator.shutdown();
});

test("errors of the callbacks are reported, not thrown", async () => {
  const error = mock.method(console, "error", () => {});
  try {
    const t = setup({
      onEngineStart: readyOnStart,
    });
    t.agents.run = mock.fn(() => {
      throw new Error("run failed");
    });
    t.agents.stopWork = mock.fn(() => Promise.reject(new Error("stop failed")));
    t.engine.jobEnded = mock.fn(() =>
      Promise.reject(new Error("ended failed")),
    );
    await t.orchestrator.start();
    t.publish("job:run", {
      id: "j",
    });
    t.publish("job:stop", {
      workId: "w",
    });
    t.agents.run = mock.fn((job, onEnded) => onEnded({}));
    t.publish("job:run", {
      id: "k",
    });
    await new Promise((resolve) => setImmediate(resolve));
    const messages = error.mock.calls.map((c) =>
      String(c.arguments[1] ?? c.arguments[0]),
    );
    assert.equal(error.mock.calls.length, 3, messages.join("|"));
    await t.orchestrator.shutdown();
  } finally {
    error.mock.restore();
  }
});

test("shutdown closes the API, stops the agents, then the engine", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  await t.orchestrator.start();
  t.calls.length = 0;
  await t.orchestrator.shutdown();
  assert.deepEqual(t.calls, ["api.close", "agents.stopAll", "engine.shutdown"]);
});

test("a job:run published once the shutdown has begun is not run", async () => {
  const t = setup({
    onEngineStart: readyOnStart,
  });
  await t.orchestrator.start();
  const done = t.orchestrator.shutdown();
  t.publish("job:run", {
    id: "late",
  });
  await done;
  t.publish("job:run", {
    id: "later",
  });
  assert.equal(t.agents.run.mock.calls.length, 0);
});

test("an addon other than notifier throws at start, before anything starts", async () => {
  const t = setup({
    extra: {
      subscriptions: [
        {
          topic: "x",
          addon: "other",
          env: {},
        },
      ],
    },
  });
  await assert.rejects(t.orchestrator.start(), /other/);
  assert.deepEqual(t.calls, []);
});

test("handleSignals: first signal shuts down, second forces exit 130", () => {
  const handlers = {};
  const shutdown = mock.fn(async () => {});
  const exit = mock.fn();
  handleSignals({
    shutdown,
    on: (signal, cb) => {
      handlers[signal] = cb;
    },
    exit,
  });
  handlers.SIGINT();
  assert.equal(shutdown.mock.calls.length, 1);
  assert.equal(exit.mock.calls.length, 0);
  handlers.SIGTERM();
  assert.equal(shutdown.mock.calls.length, 1);
  assert.deepEqual(exit.mock.calls[0].arguments, [130]);
});
