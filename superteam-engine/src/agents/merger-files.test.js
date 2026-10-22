import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DIR = new URL("../../agents/", import.meta.url);

function header(name) {
  const text = readFileSync(new URL(`${name}.md`, DIR), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${name}.md has a front matter`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return fields;
}

for (const name of ["task-merger", "work-merger"]) {
  test(`${name}.md has a valid header`, () => {
    const fields = header(name);
    assert.equal(fields.name, name);
    assert.ok(fields.description);
    const tools = fields.tools.split(",").map((t) => t.trim());
    assert.ok(tools.includes("Bash"));
    assert.ok(tools.includes("StructuredOutput"));
    assert.ok(fields.model);
  });
}
