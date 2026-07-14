import type { Logger } from "pino";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import {
  createOpenCodeOrchestrator,
  type OpenCodeOrchestrator,
} from "../orchestrator/opencode-orchestrator.js";
import { syncCcManagedMcpSpecialistWorkspaces } from "../mcp/cc-managed/workspace-sync-service.js";
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
import { createApiTokenService, type ApiTokenService } from "../services/api-token-service.js";
import {
  createTokenAuditService,
  type TokenAuditService,
} from "../services/token-audit-service.js";
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
import { createTaskContextAttachmentService } from "../services/task-context-attachment-service.js";
import {
  createSessionArchiveService,
  type SessionArchiveService,
} from "../services/session-archive-service.js";
import {
  createSessionArchiveSettingsService,
  type SessionArchiveSettingsService,
} from "../services/session-archive-settings-service.js";
import {
  createTaskRunMonitorSettingsService,
  type TaskRunMonitorSettingsService,
} from "../services/task-run-monitor-settings-service.js";
import { createSessionArchiveScheduler } from "../services/session-archive-scheduler.js";
import {
  createTaskSchedulerService,
  type TaskSchedulerService,
} from "../services/task-scheduler-service.js";
import { createTaskPermissionService } from "../services/task-permission-service.js";
import { createTaskService, type TaskService } from "../services/task-service.js";
import { settingsReconciler } from "../db/helpers.js";
import { mcpServerReconciler } from "../services/mcp-server-service.js";
import { secretsManifestReconciler } from "../services/secret-service.js";
import { documentReconciler } from "../services/document-service.js";
import { specialistReconciler } from "../services/specialist-file.js";
import { taskTemplateReconciler } from "../services/task-service.js";
import { bootstrapRuntimePaths, bootstrapWorkspaceRoot } from "./runtime-paths.js";
import { buildOpenCodeStateEnv, ensureOpenCodeStateDirs } from "../opencode/opencode-env.js";
import { runBootReconcile } from "./workspace-reconciler.js";
import { runWorkspaceMigrations } from "../workspace-migrations/service.js";
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
import {
  createSystemPromptService,
  type SystemPromptService,
} from "../system-prompts/system-prompt-service.js";
import { createActivityService, type ActivityService } from "../services/activity-service.js";
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
  /**
   * Overrides the OpenCode orchestrator. Tests inject a fake here to boot the
   * full runtime without spawning a real `opencode serve` child process.
   */
  createOrchestrator?: typeof createOpenCodeOrchestrator;
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
  apiTokenService: ApiTokenService;
  tokenAuditService?: TokenAuditService;
  ownerAccessService?: OwnerAccessService;
  liveRequestService?: LiveRequestService;
  scheduler: SchedulerService;
  taskService?: TaskService;
  taskExecutionService?: TaskExecutionService;
  taskSchedulerService?: TaskSchedulerService;
  systemVersionService?: SystemVersionService;
  sessionArchiveService?: SessionArchiveService;
  sessionArchiveSettingsService?: SessionArchiveSettingsService;
  taskRunMonitorSettingsService?: TaskRunMonitorSettingsService;
  systemPromptService?: SystemPromptService;
  activityService?: ActivityService;
  shutdownRuntime?: () => Promise<void>;
};

export type StartedServerRuntime = RuntimeContext & {
  server: AppServer;
  drain: (signal: NodeJS.Signals | "manual") => Promise<void>;
};

export type OpenCodeStartupHandle = {
  dispose(): void;
};

export async function startServerRuntime(
  options?: StartServerRuntimeOptions,
): Promise<StartedServerRuntime> {
  const config = loadRuntimeConfig({
    cwd: options?.cwd,
    env: options?.env,
    overrides: options?.overrides,
  });

  await bootstrapWorkspaceRoot(config);
  const logger = createLogger(config);
  logger.info(getStartupLogContext(config), "runtime configuration loaded");
  await runWorkspaceMigrations({ config, logger });
  await bootstrapRuntimePaths(config);

  const database = createDatabaseClient(config);
  migrateDatabase(database.db);
  await runBootReconcile(
    [
      settingsReconciler,
      mcpServerReconciler,
      secretsManifestReconciler,
      // Specialists must reconcile before task_templates: the internal
      // task_templates.agent_id column references agents.id in the SQLite cache.
      specialistReconciler,
      taskTemplateReconciler,
      documentReconciler,
    ],
    { config, db: database.db, logger },
  );
  const secretService = createSecretService({ db: database.db, config });
  const apiTokenService = createApiTokenService({ db: database.db });
  const tokenAuditService = createTokenAuditService({ db: database.db, config, logger });
  const ownerAccessService = createOwnerAccessService({ config, logger });
  await ownerAccessService.initialize();
  await logOwnerClaimStartupInstructions({
    config,
    logger,
    ownerAccessService,
  });
  logPublicBindingGuidance(config, logger);

  await ensureOpenCodeStateDirs(config.opencode.stateDir);

  const orchestratorFactory = options?.createOrchestrator ?? createOpenCodeOrchestrator;
  const orchestrator = orchestratorFactory({
    config,
    logger,
    // Spread the state-dir XDG overrides last so they win over any ambient XDG_*
    // variables and secrets, keeping OpenCode's global state under CC_OPENCODE_STATE_DIR.
    resolveEnv: async () => ({
      ...process.env,
      ...(await secretService.buildEnvMap()),
      ...buildOpenCodeStateEnv(config.opencode.stateDir),
    }),
  });

  const opencodeClient = createOpenCodeClient(config);
  const opencodeService = createOpenCodeService({ client: opencodeClient, config, logger });
  const openCodeEventService = createOpenCodeEventService({ config, logger });
  const workspaceWatchService = createWorkspaceWatchService({ logger });
  const liveRequestService = createLiveRequestService();
  const taskService = createTaskService({ db: database.db, config });
  const taskContextAttachmentService = createTaskContextAttachmentService({ config, taskService });
  const sessionArchiveService = createSessionArchiveService({ config, logger });
  const sessionArchiveSettingsService = createSessionArchiveSettingsService({ config, logger });
  const taskRunMonitorSettingsService = createTaskRunMonitorSettingsService({ config, logger });
  const systemPromptService = createSystemPromptService({ config, logger });
  const activityService = createActivityService({ db: database.db, logger });
  const sessionArchiveScheduler = createSessionArchiveScheduler({
    archiveService: sessionArchiveService,
    settingsService: sessionArchiveSettingsService,
    logger,
  });
  const conversationService = createConversationService({
    db: database.db,
    config,
    opencodeService,
    logger,
    archiveService: sessionArchiveService,
    archiveSettingsService: sessionArchiveSettingsService,
    systemPromptService,
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
    orchestrator,
    taskContextAttachmentService,
    taskPermissionService,
    logger,
    archiveService: sessionArchiveService,
    archiveSettingsService: sessionArchiveSettingsService,
    monitorSettingsService: taskRunMonitorSettingsService,
    activityService,
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
    apiTokenService,
    tokenAuditService,
    ownerAccessService,
    liveRequestService,
    scheduler,
    taskService,
    taskExecutionService,
    taskSchedulerService,
    systemVersionService,
    sessionArchiveService,
    sessionArchiveSettingsService,
    taskRunMonitorSettingsService,
    systemPromptService,
    activityService,
  };
  const server = await createServer(context);

  if (options?.register) {
    await options.register(server, context);
  }

  await syncCcManagedMcpSpecialistWorkspaces({
    db: database.db,
    config,
    logger,
  });

  const openCodeStartupRef: { current?: OpenCodeStartupHandle } = {};
  const auditPruneTimerRef: { current?: ReturnType<typeof setInterval> } = {};
  const drainController = createDrainController({
    logger,
    timeoutMs: config.timeouts.drainMs,
    handlers: {
      stopAcceptingConnections: async () => {
        await server.close();
      },
      terminateChildProcesses: async () => {
        if (auditPruneTimerRef.current) {
          clearInterval(auditPruneTimerRef.current);
        }
        openCodeStartupRef.current?.dispose();
        taskExecutionService.dispose();
        systemVersionService.stop();
        taskSchedulerService.stop();
        sessionArchiveScheduler.stop();
        await sessionArchiveService.dispose();
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
  void sessionArchiveScheduler.start();

  // Prune the per-token audit log on startup, then daily. The interval is
  // unref'd so it never keeps the process alive, and cleared on drain.
  void tokenAuditService.pruneExpired().catch(() => undefined);
  auditPruneTimerRef.current = setInterval(
    () => void tokenAuditService.pruneExpired().catch(() => undefined),
    24 * 60 * 60 * 1000,
  );
  auditPruneTimerRef.current.unref?.();

  if (options?.installSignalHandlers !== false) {
    installSignalHandlers(drainController.drain, logger);
  }

  openCodeStartupRef.current = startOpenCodeEngineBestEffort({
    orchestrator,
    logger,
    retryDelayMs: config.timeouts.opencodeHealthPollMs,
  });
  void taskExecutionService.resumeRunningTaskRuns().catch((error: unknown) => {
    logger.error({ err: error }, "task run monitor resume failed");
  });

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

export function startOpenCodeEngineBestEffort(options: {
  orchestrator: Pick<OpenCodeOrchestrator, "start" | "getStatus">;
  logger: Logger;
  retryDelayMs: number;
}): OpenCodeStartupHandle {
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempts = 0;

  const scheduleRetry = (): void => {
    if (disposed || retryTimer) {
      return;
    }

    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void start();
    }, options.retryDelayMs);
    retryTimer.unref?.();
  };

  const start = async (): Promise<void> => {
    try {
      await options.orchestrator.start();
      retryAttempts = 0;
    } catch (error) {
      if (disposed) {
        return;
      }

      const status = options.orchestrator.getStatus();
      const remainingRestartBudget = Math.max(0, status.maxRestarts - status.restartCount);

      options.logger.error(
        {
          err: error,
          engineState: status.state,
          restartCount: status.restartCount,
          maxRestarts: status.maxRestarts,
          retryAttempts,
        },
        "opencode startup failed; CommandsCenter will continue running in degraded mode",
      );

      if (retryAttempts >= remainingRestartBudget) {
        options.logger.error(
          {
            engineState: status.state,
            restartCount: status.restartCount,
            maxRestarts: status.maxRestarts,
            retryAttempts,
          },
          "opencode startup retry limit reached",
        );
        return;
      }

      retryAttempts += 1;
      scheduleRetry();
    }
  };

  void start();

  return {
    dispose(): void {
      disposed = true;

      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    },
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
  return config.security.publicOrigin;
}

function isExternalBinding(host: string): boolean {
  return !["127.0.0.1", "localhost", "::1"].includes(host);
}

export function installSignalHandlers(
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
