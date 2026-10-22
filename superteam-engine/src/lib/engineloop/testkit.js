import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Helpers shared by the tests of the engine loop.
export async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "engineloop-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

// A fake clock: each call gives a new time, so every event has its own id.
export function createClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

// A fake sleep: it records the waits, and it yields to the event loop.
export function createSleep() {
  const calls = [];
  const sleep = (ms) => {
    calls.push(ms);
    return new Promise((resolve) => setImmediate(resolve));
  };
  sleep.calls = calls;
  return sleep;
}

export async function waitFor(condition, message = "condition") {
  const deadline = Date.now() + 5000;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for ${message}`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
