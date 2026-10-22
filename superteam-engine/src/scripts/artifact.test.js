import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { artifactsDir } from "../lib/storage/paths.js";
import { readJson } from "../lib/storage/files.js";
import { writeArtifacts } from "./artifact.js";

const script = fileURLToPath(new URL("./artifact.js", import.meta.url));

async function withDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st-art-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

test("writes one file for each content", () =>
  withDir(async (dir) => {
    const paths = await writeArtifacts({
      dir,
      workId: "w",
      taskId: "t",
      contents: ["one", "two"],
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    assert.equal(paths.length, 2);
    const [x, y] = await Promise.all(paths.map((f) => readJson(f)));
    assert.notEqual(x.id, y.id);
    assert.equal(x.createdAt, y.createdAt);
    assert.equal(x.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(x.task, "t");
    assert.equal(x.work, "w");
    assert.equal(x.content, "one");
    assert.equal(y.content, "two");
    assert.equal(paths[0], path.join(artifactsDir(dir, "w"), `${x.id}.json`));
  }));

test("refuses an id that is not a slug", () =>
  withDir(async (dir) => {
    await assert.rejects(
      writeArtifacts({
        dir,
        workId: "../x",
        taskId: "t",
        contents: ["c"],
      }),
    );
    await assert.rejects(
      writeArtifacts({
        dir,
        workId: "w",
        taskId: "T",
        contents: ["c"],
      }),
    );
  }));

test("never overwrites a file", () =>
  withDir(async (dir) => {
    const args = {
      dir,
      workId: "w",
      taskId: "t",
      contents: ["c"],
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    };
    await writeArtifacts(args);
    await assert.rejects(writeArtifacts(args));
    assert.equal((await readdir(artifactsDir(dir, "w"))).length, 1);
  }));

test("the command line writes in the current folder", () =>
  withDir(async (dir) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [script, "w", "t", "hello"],
      {
        cwd: dir,
      },
    );
    const file = stdout.trim();
    assert.equal((await readJson(file)).content, "hello");
  }));

test("the command line fails with a message", () =>
  withDir(async (dir) => {
    await assert.rejects(
      promisify(execFile)(process.execPath, [script, "W", "t", "x"], {
        cwd: dir,
      }),
      (error) => error.code !== 0 && /slug/.test(error.stderr),
    );
  }));

test("the command line works through a symbolic link to the script", () =>
  withDir(async (dir) => {
    const link = path.join(dir, "artifact-link.js");
    await symlink(script, link);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [link, "w", "t", "linked"],
      {
        cwd: dir,
      },
    );
    assert.equal((await readJson(stdout.trim())).content, "linked");
  }));
