import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readRoleTools } from "./role-file.js";

let workdir;
let pluginRoot;

beforeEach(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "role-file-"));
  workdir = path.join(root, "project");
  pluginRoot = path.join(root, "plugin");
});

afterEach(async () => {
  await rm(path.dirname(workdir), {
    recursive: true,
    force: true,
  });
});

async function put(dir, role, content) {
  const folder = path.join(dir, dir === workdir ? ".claude" : "", "agents");
  await mkdir(folder, {
    recursive: true,
  });
  await writeFile(path.join(folder, `${role}.md`), content);
}

const read = (role) =>
  readRoleTools({
    workdir,
    role,
    pluginRoot,
  });

describe("readRoleTools", () => {
  it("reads the comma-separated tools line, trimmed", async () => {
    await put(
      workdir,
      "developer",
      "---\nname: developer\ntools:  Bash, Read ,Write,StructuredOutput \nmodel: sonnet\n---\n\nBody\ntools: Nope\n",
    );
    assert.deepEqual(await read("developer"), [
      "Bash",
      "Read",
      "Write",
      "StructuredOutput",
    ]);
  });

  it("returns null when the front matter has no tools line", async () => {
    await put(
      workdir,
      "developer",
      "---\nname: developer\n---\n\ntools: Bash\n",
    );
    assert.equal(await read("developer"), null);
  });

  it("reads the tools after a quoted description with a colon", async () => {
    await put(
      workdir,
      "developer",
      '---\nname: developer\ndescription: "a: b"\ntools: Bash, Read\n---\n',
    );
    assert.deepEqual(await read("developer"), ["Bash", "Read"]);
  });

  it("prefers the project file over the plugin file", async () => {
    await put(workdir, "task-merger", "---\ntools: Read\n---\n");
    await put(pluginRoot, "task-merger", "---\ntools: Bash\n---\n");
    assert.deepEqual(await read("task-merger"), ["Read"]);
  });

  it("finds the file of the plugin when the project has none", async () => {
    await put(pluginRoot, "work-merger", "---\ntools: Bash, Edit\n---\n");
    assert.deepEqual(await read("work-merger"), ["Bash", "Edit"]);
  });

  it("throws an error with both paths when no file is found", async () => {
    await assert.rejects(
      read("ghost"),
      (error) =>
        error.message.includes("ghost") &&
        error.message.includes(
          path.join(workdir, ".claude", "agents", "ghost.md"),
        ) &&
        error.message.includes(path.join(pluginRoot, "agents", "ghost.md")),
    );
  });
});
