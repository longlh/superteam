const PORT = /^\d+$/;
const NUMBER = /^\d+(\.\d+)?$/;

// The settings of `.superteam/.env`, checked: the port of the HTTP API, and the
// optional budget of an agent. Throws with the reason when one is not valid.
export function readConfig(env) {
  const { SUPERTEAM_PORT: rawPort, SUPERTEAM_MAX_BUDGET_USD: rawBudget } = env;
  const port = Number(rawPort);
  if (!PORT.test(rawPort ?? "") || port < 1 || port > 65535) {
    throw new Error(
      `SUPERTEAM_PORT must be an integer from 1 to 65535 in .superteam/.env, not "${rawPort ?? ""}"`,
    );
  }
  let maxBudgetUsd;
  if (rawBudget !== undefined && rawBudget !== "") {
    maxBudgetUsd = Number(rawBudget);
    if (
      !NUMBER.test(rawBudget) ||
      !Number.isFinite(maxBudgetUsd) ||
      maxBudgetUsd <= 0
    ) {
      throw new Error(
        `SUPERTEAM_MAX_BUDGET_USD must be a positive number in .superteam/.env, not "${rawBudget}"`,
      );
    }
  }
  return {
    port,
    maxBudgetUsd,
  };
}
