import { join } from "node:path";
import { createOrchestrator, handleSignals } from "./index.js";

const baseDir = process.cwd();
const envFile = join(baseDir, ".superteam/.env");

try {
  process.loadEnvFile(envFile);
} catch (error) {
  console.error(`cannot load ${envFile}: ${error.message}`);
  process.exit(1);
}

const port = Number(process.env.SUPERTEAM_PORT);
if (!process.env.SUPERTEAM_PORT || !Number.isInteger(port)) {
  console.error("SUPERTEAM_PORT is required in .superteam/.env");
  process.exit(1);
}
const maxBudgetUsd = process.env.SUPERTEAM_MAX_BUDGET_USD
  ? Number(process.env.SUPERTEAM_MAX_BUDGET_USD)
  : undefined;

const orchestrator = createOrchestrator({
  baseDir,
  port,
  maxBudgetUsd,
});
handleSignals({
  shutdown: () => orchestrator.shutdown().then(() => process.exit(0)),
});

try {
  await orchestrator.start();
  console.log(`superteam listening on 127.0.0.1:${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
