import { join } from "node:path";
import { createLog } from "../lib/log.js";
import { removeOwnPidFile } from "../scripts/pid-file.js";
import { readConfig } from "./config.js";
import { createOrchestrator, handleSignals } from "./index.js";
import { releaseLock, takeLock } from "./lock.js";

const baseDir = process.cwd();
// The environment before .superteam/.env is loaded: the agents get this one.
const agentEnv = {
  ...process.env,
};
const envFile = join(baseDir, ".superteam/.env");
// The stdout and the stderr go to the same file (see start.js), so what is
// written before this log, or by a crash, is kept there too.
const log = createLog({
  file: join(baseDir, ".superteam/.r/superteam.log"),
});

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

// One process of superteam runs in a workspace, even with two starts at once.
try {
  await takeLock(baseDir);
} catch (error) {
  log.error(error.message);
  process.exit(1);
}

process.on("exit", () => {
  removeOwnPidFile(baseDir, process.pid);
  releaseLock(baseDir, process.pid);
});

const orchestrator = createOrchestrator({
  baseDir,
  port,
  maxBudgetUsd,
  log,
  agentEnv,
});
handleSignals({
  shutdown: () => {
    log.info("superteam stops");
    return orchestrator
      .shutdown()
      .then(() => {
        log.info("superteam stopped");
        process.exit(0);
      })
      .catch((error) => {
        log.error(`the shutdown failed: ${error?.stack ?? error}`);
        process.exit(1);
      });
  },
});

try {
  await orchestrator.start();
  log.info(`superteam listening on 127.0.0.1:${port}`);
} catch (error) {
  log.error(error?.stack ?? String(error));
  process.exit(1);
}

orchestrator.done.catch((error) => {
  log.error(`the engine stopped: ${error?.stack ?? error}`);
  process.exit(1);
});
