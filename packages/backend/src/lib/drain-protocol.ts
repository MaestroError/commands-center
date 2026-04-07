import type { Logger } from "pino";

const DRAIN_PHASES = [
  "stopAcceptingConnections",
  "cancelScheduledJobs",
  "terminateChildProcesses",
  "syncFinalState",
  "closeResources",
  "flushLogs",
] as const;

type DrainPhase = (typeof DRAIN_PHASES)[number];
type DrainHandler = () => Promise<void> | void;

export type DrainHandlers = Partial<Record<DrainPhase, DrainHandler>>;

export type DrainController = {
  drain: (signal: NodeJS.Signals | "manual") => Promise<void>;
};

export function createDrainController(options: {
  logger: Logger;
  timeoutMs: number;
  handlers: DrainHandlers;
}): DrainController {
  let drainPromise: Promise<void> | undefined;

  return {
    drain(signal) {
      if (drainPromise) {
        return drainPromise;
      }

      drainPromise = runDrain(options.logger, options.timeoutMs, options.handlers, signal);
      return drainPromise;
    },
  };
}

async function runDrain(
  logger: Logger,
  timeoutMs: number,
  handlers: DrainHandlers,
  signal: NodeJS.Signals | "manual",
): Promise<void> {
  logger.info({ signal, timeoutMs }, "starting runtime drain");

  const timeout = new Promise<never>((_, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(`Drain protocol timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    handle.unref();
  });

  await Promise.race([
    (async () => {
      for (const phase of DRAIN_PHASES) {
        const handler = handlers[phase];

        if (!handler) {
          continue;
        }

        logger.debug({ phase }, "running drain phase");
        await handler();
      }
    })(),
    timeout,
  ]);

  logger.info({ signal }, "runtime drain completed");
}
