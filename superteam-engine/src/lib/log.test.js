import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLog } from "./log.js";

test("each entry is one line with the time, the level and the message", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "log-"));
  try {
    const file = path.join(dir, ".superteam", ".r", "superteam.log");
    const log = createLog({
      file,
      now: () => new Date("2026-01-02T03:04:05.000Z"),
    });
    log.info("started");
    log.warn("slow");
    log.error("broken");
    assert.equal(
      await readFile(file, "utf8"),
      [
        "2026-01-02T03:04:05.000Z INFO started",
        "2026-01-02T03:04:05.000Z WARN slow",
        "2026-01-02T03:04:05.000Z ERROR broken",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
});
