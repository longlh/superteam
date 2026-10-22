// The command of an agent.
export const CLAUDE = "claude";

export function buildCommand(job, { maxBudgetUsd } = {}) {
  const args = [
    "-p",
    job.instruction.prompt,
    "--agent",
    job.role,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(job.schema),
    "--permission-mode",
    "dontAsk",
  ];
  if (maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }
  return {
    command: CLAUDE,
    args,
  };
}

export const STDERR_TAIL = 2000;

// The reason with the end of the stderr, when there is one: it says why.
function withStderr(reason, stderr) {
  const tail = String(stderr ?? "")
    .slice(-STDERR_TAIL)
    .trim();
  return tail === "" ? reason : `${reason}: ${tail}`;
}

export function parseResult(stdout, exitCode, signal, stderr = "") {
  if (exitCode === null) {
    return {
      error: withStderr(`the agent was killed by the signal ${signal}`, stderr),
    };
  }
  if (exitCode !== 0) {
    return {
      error: withStderr(`the agent exited with exit code ${exitCode}`, stderr),
    };
  }
  let output;
  try {
    output = JSON.parse(stdout);
  } catch {
    return {
      error: "the output of the agent is not JSON",
    };
  }
  if (output?.is_error === true) {
    return {
      error: `the agent reported an error (${output.subtype ?? "unknown"})${
        typeof output.result === "string" && output.result.trim() !== ""
          ? `: ${output.result.trim().slice(0, STDERR_TAIL)}`
          : ""
      }`,
    };
  }
  const structured = output?.structured_output;
  if (structured === null || structured === undefined) {
    return {
      error: "the result does not match the schema",
    };
  }
  if (
    typeof structured.summary !== "string" ||
    typeof structured.data !== "object" ||
    structured.data === null
  ) {
    return {
      error: "the result does not match the schema",
    };
  }
  return {
    summary: structured.summary,
    data: structured.data,
  };
}
