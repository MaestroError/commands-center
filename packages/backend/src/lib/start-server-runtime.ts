import type { Logger } from "pino";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import {
  createOpenCodeOrchestrator,
  type OpenCodeOrchestrator,
} from "../orchestrator/opencode-orchestrator.js";
import { syncCcManagedMcpAgentWorkspaces } from "../mcp/cc-managed/workspace-sync-service.js";
import { createOpenCodeClient } from "./opencode-client.js";
import { createOpenCodeService, type OpenCodeService } from "../services/opencode-service.js";
import { createConversationService } from "../services/conversation-service.js";
import {
  createOpenCodeEventService,
  type OpenCodeEventService,
} from "../services/opencode-event-service.js";
import {
  createWorkspaceWatchService,
  type WorkspaceWatchService,
} from "../services/workspace-watch-service.js";
import { createSecretService, type SecretService } from "../services/secret-service.js";
import {
  createOwnerAccessService,
  type OwnerAccessService,
} from "../services/owner-access-service.js";
import {
  createLiveRequestService,
  type LiveRequestService,
} from "../services/live-request-service.js";
import { createSchedulerService, type SchedulerService } from "../services/scheduler-service.js";
import {
  createTaskExecutionService,
  type TaskExecutionService,
} from "../services/task-execution-service.js";
import {
  createTaskSchedulerService,
  type TaskSchedulerService,
} from "../services/task-scheduler-service.js";
import { createTaskPermissionService } from "../services/task-permission-service.js";
import { createTaskService, type TaskService } from "../services/task-service.js";
import { bootstrapRuntimePaths } from "./runtime-paths.js";
import { createDrainController, type DrainHandlers } from "./drain-protocol.js";
import { createLogger, flushLogger } from "./logger.js";
import { readPackageInfo } from "./package-info.js";
import {
  getStartupLogContext,
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "./runtime-config.js";
import {
  createSystemVersionService,
  type SystemVersionService,
} from "../services/system-version-service.js";
import { createServer } from "../server.js";
import { isActiveClaimCode } from "./owner-claim-code.js";

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
  workspaceWatchService?: WorkspaceWatchService;
  secretService: SecretService;
  ownerAccessService?: OwnerAccessService;
  liveRequestService?: LiveRequestService;
  scheduler: SchedulerService;
  taskService?: TaskService;
  taskExecutionService?: TaskExecutionService;
  taskSchedulerService?: TaskSchedulerService;
  systemVersionService?: SystemVersionService;
  shutdownRuntime?: () => Promise<void>;
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
  const ownerAccessService = createOwnerAccessService({ config, logger });
  await ownerAccessService.initialize();
  await logOwnerClaimStartupInstructions({
    config,
    logger,
    ownerAccessService,
  });
  logPublicBindingGuidance(config, logger);

  const orchestrator = createOpenCodeOrchestrator({
    config,
    logger,
    resolveEnv: async () => ({ ...process.env, ...(await secretService.buildEnvMap()) }),
  });

  const opencodeClient = createOpenCodeClient(config);
  const opencodeService = createOpenCodeService({ client: opencodeClient, config, logger });
  const openCodeEventService = createOpenCodeEventService({ config, logger });
  const workspaceWatchService = createWorkspaceWatchService({ logger });
  const liveRequestService = createLiveRequestService();
  const taskService = createTaskService({ db: database.db, config });
  const conversationService = createConversationService({
    db: database.db,
    config,
    opencodeService,
  });
  const taskPermissionService = createTaskPermissionService({
    db: database.db,
    config,
    opencodeService,
  });
  const taskSchedulerServiceRef: { current?: TaskSchedulerService } = {};
  const taskExecutionService = createTaskExecutionService({
    db: database.db,
    taskService,
    conversationService,
    taskPermissionService,
    logger,
    onRunTerminal: (run) => taskSchedulerServiceRef.current?.handleRunTerminal(run),
  });
  const taskSchedulerService = createTaskSchedulerService({
    db: database.db,
    taskService,
    executionService: taskExecutionService,
    logger,
  });
  taskSchedulerServiceRef.current = taskSchedulerService;
  const scheduler = createSchedulerService({ delegate: taskSchedulerService });
  const packageInfo = readPackageInfo();
  const drainRuntime: {
    drain?: (signal: NodeJS.Signals | "manual") => Promise<void>;
  } = {};
  const systemVersionService = createSystemVersionService({
    config,
    logger,
    packageInfo,
    packageRoot: packageInfo.packageRoot,
    db: database.db,
    drainController: {
      drain: (signal) => drainRuntime.drain?.(signal) ?? Promise.resolve(),
    },
  });

  const context: RuntimeContext = {
    config,
    logger,
    database,
    orchestrator,
    opencodeService,
    openCodeEventService,
    workspaceWatchService,
    secretService,
    ownerAccessService,
    liveRequestService,
    scheduler,
    taskService,
    taskExecutionService,
    taskSchedulerService,
    systemVersionService,
  };
  const server = await createServer(context);

  if (options?.register) {
    await options.register(server, context);
  }

  await syncCcManagedMcpAgentWorkspaces({
    db: database.db,
    config,
    logger,
  });

  const drainController = createDrainController({
    logger,
    timeoutMs: config.timeouts.drainMs,
    handlers: {
      stopAcceptingConnections: async () => {
        await server.close();
      },
      terminateChildProcesses: async () => {
        systemVersionService.stop();
        taskSchedulerService.stop();
        await orchestrator.stop();
        liveRequestService.dispose();
        workspaceWatchService.dispose();
        database.close();
      },
      ...options?.extraDrainHandlers,
      flushLogs: () => {
        flushLogger(logger);
      },
    },
  });
  drainRuntime.drain = drainController.drain;
  context.shutdownRuntime = () => drainController.drain("manual");
  systemVersionService.start();
  taskSchedulerService.start();

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

export async function logOwnerClaimStartupInstructions(options: {
  config: RuntimeConfig;
  logger: Logger;
  ownerAccessService: Pick<OwnerAccessService, "getState" | "rotateClaimCode">;
}): Promise<void> {
  const state = await options.ownerAccessService.getState();
  const claimed = state.claimedAt !== undefined && state.ownerPassword !== undefined;

  if (claimed) {
    options.logger.info({ authState: "claimed" }, "workspace owner access is claimed");
    return;
  }

  const claimUrl = `${getOperatorBaseUrl(options.config)}/claim`;

  if (isActiveClaimCode(state.claimCode)) {
    options.logger.warn(
      {
        authState: "unclaimed",
        claimUrl,
        workspaceDir: options.config.paths.workspaceDir,
      },
      "workspace is unclaimed and an active claim code already exists; run ccenter claim --yes in the same workspace context if the code was missed",
    );
    return;
  }

  const result = await options.ownerAccessService.rotateClaimCode();
  options.logger.warn(
    {
      authState: "unclaimed",
      claimCode: result.code,
      claimUrl,
      workspaceDir: options.config.paths.workspaceDir,
    },
    "workspace is unclaimed; open the claim URL and use this one-time claim code",
  );
}

export function logPublicBindingGuidance(config: RuntimeConfig, logger: Logger): void {
  const externalBinding = isExternalBinding(config.server.host);

  logger.info(
    {
      localUrl: `http://127.0.0.1:${config.server.port.toString()}`,
      publicOrigin: config.security.publicOrigin,
      allowedOrigins: config.security.allowedOrigins,
    },
    "operator access URLs configured",
  );

  if (!externalBinding) {
    return;
  }

  logger.warn(
    {
      host: config.server.host,
      port: config.server.port,
      publicOrigin: config.security.publicOrigin,
    },
    "server is bound to an externally reachable address; use HTTPS and set CC_PUBLIC_ORIGIN when exposing CommandsCenter publicly",
  );
}

function getOperatorBaseUrl(config: RuntimeConfig): string {
  return config.security.publicOrigin ?? `http://127.0.0.1:${config.server.port.toString()}`;
}

function isExternalBinding(host: string): boolean {
  return !["127.0.0.1", "localhost", "::1"].includes(host);
}

function installSignalHandlers(
  drain: (signal: NodeJS.Signals) => Promise<void>,
  logger: Logger,
): void {
  let draining = false;

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (draining) {
      logger.warn({ signal }, "received additional shutdown signal; forcing exit");
      process.exit(process.exitCode ?? 1);
    }

    draining = true;

    void drain(signal)
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        logger.error({ err: error, signal }, "runtime drain failed");
        process.exitCode = 1;
      });
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      handleSignal(signal);
    });
  }
}
