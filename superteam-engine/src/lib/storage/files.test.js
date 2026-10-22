import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listJson, readJson, writeJson } from "./files.js";

async function withTemp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "storage-files-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

test("readJson of a missing file is null", async () => {
  await withTemp(async (dir) => {
    assert.equal(await readJson(path.join(dir, "no.json")), null);
  });
});

test("writeJson then readJson round-trips and leaves no temp file", async () => {
  await withTemp(async (dir) => {
    const file = path.join(dir, "a", "b", "x.json");
    await writeJson(file, {
      a: 1,
    });
    assert.deepEqual(await readJson(file), {
      a: 1,
    });
    assert.deepEqual(await readdir(path.dirname(file)), ["x.json"]);
  });
});

test("listJson of a missing folder is empty", async () => {
  await withTemp(async (dir) => {
    assert.deepEqual(await listJson(path.join(dir, "no")), []);
  });
});

test("listJson reads the json files only, sorted by name", async () => {
  await withTemp(async (dir) => {
    await writeJson(path.join(dir, "b.json"), {
      n: "b",
    });
    await writeJson(path.join(dir, "a.json"), {
      n: "a",
    });
    await writeJson(path.join(dir, "c.txt"), {
      n: "c",
    });
    assert.deepEqual(await listJson(dir), [
      {
        n: "a",
      },
      {
        n: "b",
      },
    ]);
  });
});
