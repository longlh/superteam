import assert from "node:assert/strict";
import { test } from "node:test";
import { createBranchNames, DEFAULT_PREFIX, parseConfig } from "./branches.js";

test("the branches of a work and of its tasks have the prefix", () => {
  const names = createBranchNames("acme");
  assert.equal(names.work("w1"), "acme-work/w1");
  assert.equal(names.task("w1", "build"), "acme-task/w1/build");
  assert.equal(names.works, "acme-work/");
  assert.equal(names.tasks, "acme-task/");
  assert.equal(names.tasksOf("w1"), "acme-task/w1/");
});

test("the id of a work is read back from the name of its branch", () => {
  const names = createBranchNames("acme");
  assert.equal(names.workIdOf("acme-work/w1"), "w1");
  assert.equal(names.workIdOf("acme-task/w1/build"), "w1");
  assert.equal(names.workIdOf("other/w1"), null);
});

test("the default prefix is superteam", () => {
  assert.equal(DEFAULT_PREFIX, "superteam");
  assert.equal(createBranchNames().work("w1"), "superteam-work/w1");
});

test("a config gives its branchPrefix, and no config gives the default", () => {
  assert.equal(parseConfig(null), "superteam");
  assert.equal(parseConfig('{ "branchPrefix": "acme" }'), "acme");
  assert.equal(parseConfig("{}"), "superteam");
});

test("a config that is not valid is refused, with the reason", () => {
  for (const [text, reason] of [
    ["{ not json", /config\.json is not valid JSON/],
    ["[]", /config\.json must be an object/],
    ['{ "branchPrefix": "Acme" }', /branchPrefix must be a slug/],
    ['{ "branchPrefix": "a/b" }', /branchPrefix must be a slug/],
    ['{ "branchPrefix": 5 }', /branchPrefix must be a slug/],
  ]) {
    assert.throws(() => parseConfig(text), reason, text);
  }
});
