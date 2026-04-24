import type { Logger } from "pino";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import {
  createOpenCodeOrchestrator,
  type OpenCodeOrchestrator,
} from "../orchestrator/opencode-orchestrator.js";
import { createOpenCodeClient } from "./opencode-client.js";
import { createOpenCodeService, type OpenCodeService } from "../services/opencode-service.js";
import {
  createOpenCodeEventService,
  type OpenCodeEventService,
} from "../services/opencode-event-service.js";
import { createSecretService, type SecretService } from "../services/secret-service.js";
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
  openCodeEventService: OpenCodeEventService;
  secretService: SecretService;
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
  const secretService = createSecretService({ db: database.db, config });

  const orchestrator = createOpenCodeOrchestrator({
    config,
    logger,
    resolveEnv: async () => ({ ...process.env, ...(await secretService.buildEnvMap()) }),
  });

  const opencodeClient = createOpenCodeClient(config);
  const opencodeService = createOpenCodeService({ client: opencodeClient, config, logger });
  const openCodeEventService = createOpenCodeEventService({ config, logger });
  const scheduler = createSchedulerService();

  const context: RuntimeContext = {
    config,
    logger,
    database,
    orchestrator,
    opencodeService,
    openCodeEventService,
    secretService,
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

  await orchestrator.start();

  try {
    await server.listen({
      host: config.server.host,
      port: config.server.port,
    });
  } catch (error) {
    logger.error({ err: error }, "runtime server failed to listen; draining");
    await drainController.drain("manual").catch((drainError: unknown) => {
      logger.error({ err: drainError }, "runtime drain failed during startup recovery");
    });
    throw error;
  }

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
