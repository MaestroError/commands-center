import pino, { type Logger, type LoggerOptions } from "pino";

import type { RuntimeConfig } from "./runtime-config.js";

export function createLogger(config: RuntimeConfig): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    base: undefined,
  };

  if (config.nodeEnv !== "production") {
    options.transport = {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    };
  }

  return pino(options);
}

export function flushLogger(logger: Logger): void {
  logger.flush();
}
