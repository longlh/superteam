import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommand, parseResult } from "./claude-process.js";

const job = {
  id: "w1/t1/worker",
  role: "developer",
  timeout: 720,
  workdir: "/tmp/x",
  schema: {
    type: "object",
  },
  instruction: {
    target: "task",
    targetIds: ["t1"],
    prompt: "Do the task",
  },
};

describe("buildCommand", () => {
  it("builds the command of the agent", () => {
    assert.deepEqual(buildCommand(job), {
      command: "claude",
      args: [
        "-p",
        "Do the task",
        "--agent",
        "developer",
        "--output-format",
        "json",
        "--json-schema",
        '{"type":"object"}',
        "--permission-mode",
        "dontAsk",
      ],
    });
  });

  it("gives --max-budget-usd only when it is given", () => {
    const withBudget = buildCommand(job, {
      maxBudgetUsd: 2.5,
    });
    assert.deepEqual(withBudget.args.slice(-2), ["--max-budget-usd", "2.5"]);
    assert.ok(!buildCommand(job).args.includes("--max-budget-usd"));
  });
});

describe("parseResult", () => {
  const ok = JSON.stringify({
    is_error: false,
    structured_output: {
      summary: "done",
      data: {
        a: 1,
      },
    },
  });

  it("returns summary and data", () => {
    assert.deepEqual(parseResult(ok, 0), {
      summary: "done",
      data: {
        a: 1,
      },
    });
  });

  it("errors on a non-zero exit code", () => {
    assert.match(parseResult(ok, 3).error, /exit code 3/);
  });

  it("keeps the last 2000 characters of the stderr in the error of an exit or a signal", () => {
    const stderr = `${"x".repeat(3000)}the real reason\n`;
    for (const error of [
      parseResult(ok, 3, null, stderr).error,
      parseResult("", null, "SIGTERM", stderr).error,
    ]) {
      assert.match(error, /the real reason$/);
      assert.ok(error.length < 2100, String(error.length));
    }
    assert.equal(
      parseResult(ok, 3, null, "  \n").error,
      "the agent exited with exit code 3",
    );
  });

  it("keeps the result text of an is_error output", () => {
    const out = JSON.stringify({
      is_error: true,
      subtype: "success",
      result: "Credit balance is too low",
    });
    assert.equal(
      parseResult(out, 0).error,
      "the agent reported an error (success): Credit balance is too low",
    );
  });

  it("errors on text that is not JSON", () => {
    assert.match(parseResult("nope", 0).error, /not JSON/);
  });

  it("errors on is_error, with the subtype", () => {
    const out = JSON.stringify({
      is_error: true,
      subtype: "error_max_budget_usd",
    });
    assert.match(parseResult(out, 0).error, /error_max_budget_usd/);
  });

  it("errors on a null or absent structured_output", () => {
    for (const body of [
      {
        is_error: false,
        structured_output: null,
      },
      {
        is_error: false,
      },
    ]) {
      assert.equal(
        parseResult(JSON.stringify(body), 0).error,
        "the result does not match the schema",
      );
    }
  });

  it("errors on a summary or data of the wrong type", () => {
    for (const structured of [
      {
        data: {},
      },
      {
        summary: "x",
      },
      {
        summary: "x",
        data: null,
      },
    ]) {
      const out = JSON.stringify({
        is_error: false,
        structured_output: structured,
      });
      assert.equal(
        parseResult(out, 0).error,
        "the result does not match the schema",
      );
    }
  });

  it("names the signal when the process was killed", () => {
    assert.match(parseResult("", null, "SIGKILL").error, /SIGKILL/);
  });
});
