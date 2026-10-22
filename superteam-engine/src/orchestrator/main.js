import { join } from "node:path";
import { removeOwnPidFile } from "../scripts/pid-file.js";
import { readConfig } from "./config.js";
import { createOrchestrator, handleSignals } from "./index.js";

const baseDir = process.cwd();
const envFile = join(baseDir, ".superteam/.env");

try {
  process.loadEnvFile(envFile);
} catch (error) {
  console.error(`cannot load ${envFile}: ${error.message}`);
  process.exit(1);
}

let config;
try {
  config = readConfig(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { port, maxBudgetUsd } = config;

process.on("exit", () => removeOwnPidFile(baseDir, process.pid));

const orchestrator = createOrchestrator({
  baseDir,
  port,
  maxBudgetUsd,
});
const eventOf = (data) =>
  `${data?.event?.payload?.type ?? "unknown"} (${data?.event?.id ?? "no id"})`;
orchestrator.subscribe("event:retry", (data) =>
  console.error(`the event ${eventOf(data)} failed, retried: ${data?.error}`),
);
orchestrator.subscribe("event:error", (data) =>
  console.error(`the event ${eventOf(data)} failed for good: ${data?.error}`),
);
handleSignals({
  shutdown: () =>
    orchestrator
      .shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("the shutdown failed:", error);
        process.exit(1);
      }),
});

try {
  await orchestrator.start();
  console.log(`superteam listening on 127.0.0.1:${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}

orchestrator.done.catch((error) => {
  console.error("the engine stopped:", error);
  process.exit(1);
});
