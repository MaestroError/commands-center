import type { Logger } from "pino";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import {
  createOpenCodeOrchestrator,
  type OpenCodeOrchestrator,
} from "../orchestrator/opencode-orchestrator.js";
import { createOpenCodeClient } from "./opencode-client.js";
import { createOpenCodeService, type OpenCodeService } from "../services/opencode-service.js";
import { createSchedulerService, type SchedulerService } from "../services/scheduler-service.js";
import { bootstrapRuntimePaths } from "./runtime-paths.js";
import { createDrainController, type DrainHandlers } from "./drain-protocol.js";
import { createLogger, flushLogger } from "./logger.js";
import {
  getStartupLogContext,
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "./runtime-config.js";
import { createServer } from "../server.js";

type AppServer = Awaited<ReturnType<typeof createServer>>;

export type StartServerRuntimeOptions = {
  overrides?: RuntimeConfigOverrides;
  register?: (server: AppServer, context: RuntimeContext) => Promise<void>;
  extraDrainHandlers?: DrainHandlers;
  installSignalHandlers?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type RuntimeContext = {
  config: RuntimeConfig;
  logger: Logger;
  database: DatabaseClient;
  orchestrator: OpenCodeOrchestrator;
  opencodeService: OpenCodeService;
  scheduler: SchedulerService;
};

export type StartedServerRuntime = RuntimeContext & {
  server: AppServer;
  drain: (signal: NodeJS.Signals | "manual") => Promise<void>;
};

export async function startServerRuntime(
  options?: StartServerRuntimeOptions,
): Promise<StartedServerRuntime> {
  const config = loadRuntimeConfig({
    cwd: options?.cwd,
    env: options?.env,
    overrides: options?.overrides,
  });

  await bootstrapRuntimePaths(config);

  const logger = createLogger(config);
  logger.info(getStartupLogContext(config), "runtime configuration loaded");
  const database = createDatabaseClient(config);
  migrateDatabase(database.db);

  const orchestrator = createOpenCodeOrchestrator({
    config,
    logger,
  });

  await orchestrator.start();

  const opencodeClient = createOpenCodeClient(config);
  const opencodeService = createOpenCodeService({ client: opencodeClient, config });
  const scheduler = createSchedulerService();

  const context: RuntimeContext = {
    config,
    logger,
    database,
    orchestrator,
    opencodeService,
    scheduler,
  };
  const server = await createServer(context);

  if (options?.register) {
    await options.register(server, context);
  }

  const drainController = createDrainController({
    logger,
    timeoutMs: config.timeouts.drainMs,
    handlers: {
      stopAcceptingConnections: async () => {
        await server.close();
      },
      terminateChildProcesses: async () => {
        await orchestrator.stop();
        database.close();
      },
      ...options?.extraDrainHandlers,
      flushLogs: () => {
        flushLogger(logger);
      },
    },
  });

  if (options?.installSignalHandlers !== false) {
    installSignalHandlers(drainController.drain, logger);
  }

  await server.listen({
    host: config.server.host,
    port: config.server.port,
  });

  logger.info(
    {
      host: config.server.host,
      port: config.server.port,
    },
    "runtime server listening",
  );

  return {
    ...context,
    server,
    drain: drainController.drain,
  };
}

function installSignalHandlers(
  drain: (signal: NodeJS.Signals) => Promise<void>,
  logger: Logger,
): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void drain(signal)
        .then(() => {
          process.exitCode = 0;
        })
        .catch((error: unknown) => {
          logger.error({ err: error, signal }, "runtime drain failed");
          process.exitCode = 1;
        });
    });
  }
}
