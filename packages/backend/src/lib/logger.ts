import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

import type { RuntimeConfig } from "./runtime-config.js";
import { hasPublicMcpUrlToken, redactSensitiveQuery, redactSensitiveUrl } from "./url-redaction.js";

export function createLogger(config: RuntimeConfig, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    base: undefined,
    serializers: {
      req(request: Parameters<typeof pino.stdSerializers.req>[0]) {
        const serialized = pino.stdSerializers.req(request);
        const url = typeof serialized.url === "string" ? serialized.url : undefined;
        return {
          ...serialized,
          url: url ? redactSensitiveUrl(url) : serialized.url,
          query:
            url && hasPublicMcpUrlToken(url)
              ? redactSensitiveQuery(serialized.query)
              : serialized.query,
        };
      },
    },
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

  return destination ? pino(options, destination) : pino(options);
}

export function flushLogger(logger: Logger): void {
  logger.flush();
}
