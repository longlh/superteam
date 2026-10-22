import assert from "node:assert/strict";
import { test } from "node:test";
import { jobSchema } from "./schemas.js";

for (const entity of ["TASK", "WORK"]) {
  test(`jobSchema(${entity}) requires summary and data`, () => {
    const schema = jobSchema(entity);
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.required, ["summary", "data"]);
    assert.equal(schema.properties.summary.type, "string");
    assert.deepEqual(schema.properties.data.properties.dodChecklist, {
      type: "array",
      items: {
        type: "boolean",
      },
    });
  });
}

test("jobSchema refuses an unknown entity", () => {
  assert.throws(() => jobSchema("X"));
});
