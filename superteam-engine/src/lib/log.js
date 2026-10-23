import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const LEVELS = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function make(write) {
  return Object.fromEntries(
    Object.entries(LEVELS).map(([name, level]) => [
      name,
      (message) => write(level, message),
    ]),
  );
}

// The log of the process: one line for each entry, with the time, the level
// and the message, appended to `file`.
export function createLog({ file, now = () => new Date() }) {
  mkdirSync(path.dirname(file), {
    recursive: true,
  });
  return make((level, message) =>
    appendFileSync(file, `${now().toISOString()} ${level} ${message}\n`),
  );
}

// The log of a part that is given no log, such as in a test: the stderr.
export const consoleLog = make((level, message) =>
  console.error(`${level} ${message}`),
);
