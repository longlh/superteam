import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "./config.js";

test("reads the port and the budget", () => {
  assert.deepEqual(
    readConfig({
      SUPERTEAM_PORT: "4100",
      SUPERTEAM_MAX_BUDGET_USD: "2.5",
    }),
    {
      port: 4100,
      maxBudgetUsd: 2.5,
    },
  );
  assert.deepEqual(
    readConfig({
      SUPERTEAM_PORT: "65535",
    }),
    {
      port: 65535,
      maxBudgetUsd: undefined,
    },
  );
});

test("refuses a port that is missing or not an integer from 1 to 65535", () => {
  for (const port of [undefined, "", "abc", "0", "65536", "1.5", "-1", "80x"]) {
    assert.throws(
      () =>
        readConfig({
          SUPERTEAM_PORT: port,
        }),
      /SUPERTEAM_PORT must be an integer from 1 to 65535/,
      String(port),
    );
  }
});

test("refuses a budget that is not a positive number", () => {
  for (const budget of ["abc", "0", "-1", "1e400", "2usd"]) {
    assert.throws(
      () =>
        readConfig({
          SUPERTEAM_PORT: "4100",
          SUPERTEAM_MAX_BUDGET_USD: budget,
        }),
      /SUPERTEAM_MAX_BUDGET_USD must be a positive number/,
      budget,
    );
  }
});
