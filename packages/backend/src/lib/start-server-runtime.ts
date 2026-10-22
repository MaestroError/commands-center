import { createMcpToolPermissionService } from "../services/mcp-tool-permission-service.js";
import { readEmbeddedMcpCatalog } from "../opencode/embedded-mcp-catalog.js";
import {
  createEmbeddedMcpToolPolicy,
  type EmbeddedMcpToolPolicy,
} from "../opencode/embedded-mcp-tool-policy.js";
import { buildEmbeddedTaskPermissions } from "../opencode/embedded-task-permissions.js";
import {
  createEmbeddedCcToolService,
  type EmbeddedCcTools,
} from "../opencode/embedded-cc-tools.js";
import { createCcManagedMcpServerRegistry } from "../mcp/cc-managed/server-registry.js";
import type { Logger } from "pino";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import { createEmbeddedRuntime, type EmbeddedRuntime } from "../opencode/embedded-runtime.js";
import { createEmbeddedEngineService } from "../opencode/embedded-engine-service.js";
import { createEmbeddedLifecycle } from "../opencode/embedded-lifecycle.js";
import {
  createEmbeddedWorkspaceServices,
  type EmbeddedWorkspaceServices,
} from "../opencode/embedded-workspace-services.js";
import { syncEmbeddedGlobalMcpConfig } from "../opencode/embedded-mcp-config.js";

import type { OpenCodeService } from "../services/opencode-service.js";
import { createConversationService } from "../services/conversation-service.js";
import {
  createInteractiveChatWatchdogService,
  type InteractiveChatWatchdogService,
} from "../services/interactive-chat-watchdog-service.js";
import type { OpenCodeEventService } from "../services/opencode-event-service.js";
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
  createEmbeddedRuntime?: typeof createEmbeddedRuntime;
};

export type RuntimeContext = {
  config: RuntimeConfig;
  logger: Logger;
  database: DatabaseClient;
  embeddedRuntime?: EmbeddedRuntime;
  workspaceServices?: EmbeddedWorkspaceServices;
  orchestrator: OpenCodeOrchestrator;
  opencodeService: OpenCodeService;
  openCodeEventService: OpenCodeEventService;
  interactiveChatWatchdogService?: InteractiveChatWatchdogService;
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
  const cleanup: (() => void | Promise<void>)[] = [() => database.close()];
  try {
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

    const mcpTools: { current?: EmbeddedMcpToolPolicy } = {};
    const ccTools: { current?: EmbeddedCcTools } = {};
    const embeddedRuntime = await (options?.createEmbeddedRuntime ?? createEmbeddedRuntime)({
      ccTools,
      mcpTools,
      workspaceDirectory: config.paths.workspaceDir,
      publicOrigin: config.security.publicOrigin,
      logger,
      resolveEnvironment: () => secretService.buildEnvMap(),
      prepareConfiguration: (callbacks) =>
        syncEmbeddedGlobalMcpConfig(database.db, config, callbacks),
    });
    cleanup.push(() => embeddedRuntime.close());
    const workspaceServices = createEmbeddedWorkspaceServices({
      config,
      db: database.db,
      runtime: embeddedRuntime,
      secretService,
    });
    const orchestrator = createEmbeddedLifecycle(embeddedRuntime, config.paths.workspaceDir);
    const opencodeService = createEmbeddedEngineService(embeddedRuntime, config);
    const openCodeEventService = embeddedRuntime.events;
    const interactiveChatWatchdogService = createInteractiveChatWatchdogService({
      opencodeService,
      logger,
      prepareTimeoutMs: config.timeouts.opencodeRequestMs,
    });
    const workspaceWatchService = createWorkspaceWatchService({ logger });
    cleanup.push(
      () => workspaceWatchService.dispose(),
      () => interactiveChatWatchdogService.dispose(),
    );
    const liveRequestService = createLiveRequestService();
    cleanup.push(() => liveRequestService.dispose());
    const mcpToolPermissions = createMcpToolPermissionService({
      db: database.db,
      specialistsDirectory: config.paths.subdirectories.specialists,
      readCatalog: (directory) => readEmbeddedMcpCatalog(embeddedRuntime.host, directory),
    });
    mcpTools.current = createEmbeddedMcpToolPolicy({
      db: database.db,
      specialistsDirectory: config.paths.subdirectories.specialists,
      host: embeddedRuntime.host,
    });
    const taskService = createTaskService({ db: database.db, config, mcpToolPermissions });
    const taskContextAttachmentService = createTaskContextAttachmentService({
      config,
      taskService,
    });
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
      interactiveChatWatchdogService,
    });
    cleanup.push(
      () => conversationService.dispose(),
      () => sessionArchiveService.dispose(),
      () => sessionArchiveScheduler.stop(),
    );
    const taskPermissionService = createTaskPermissionService({
      mcpTools: mcpToolPermissions,
      initializeMcpTools: (directory) => embeddedRuntime.host.listTools(directory),
      db: database.db,
      config,
      opencodeService,
      customToolService: workspaceServices.customTools,
    });
    const taskSchedulerServiceRef: { current?: TaskSchedulerService } = {};
    const taskExecutionService = createTaskExecutionService({
      db: database.db,
      taskService,
      conversationService,
      orchestrator,
      taskContextAttachmentService,
      taskPermissionService,
      buildSessionPermissions: buildEmbeddedTaskPermissions,
      logger,
      archiveService: sessionArchiveService,
      archiveSettingsService: sessionArchiveSettingsService,
      monitorSettingsService: taskRunMonitorSettingsService,
      activityService,
      onRunTerminal: (run) => taskSchedulerServiceRef.current?.handleRunTerminal(run),
    });
    ccTools.current = createEmbeddedCcToolService({
      db: database.db,
      specialistsDirectory: config.paths.subdirectories.specialists,
      host: embeddedRuntime.host,
      groups: createCcManagedMcpServerRegistry({
        db: database.db,
        config,
        opencodeService,
        agentService: workspaceServices.specialists,
        customToolService: workspaceServices.customTools,
        customToolActionService: workspaceServices.customToolActions,
        conversationService,
        liveRequestService,
        secretService,
        orchestrator,
        activityService,
        taskService,
        taskExecutionService,
        sessionArchiveService,
        sessionArchiveSettingsService,
      }),
    });
    const taskSchedulerService = createTaskSchedulerService({
      db: database.db,
      taskService,
      executionService: taskExecutionService,
      logger,
    });
    cleanup.push(
      () => taskExecutionService.dispose(),
      () => taskSchedulerService.stop(),
    );
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

    cleanup.push(() => systemVersionService.stop());
    const context: RuntimeContext = {
      embeddedRuntime,
      workspaceServices,
      config,
      logger,
      database,
      orchestrator,
      opencodeService,
      openCodeEventService,
      interactiveChatWatchdogService,
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
    cleanup.push(() => server.close());

    if (options?.register) {
      await options.register(server, context);
    }

    await workspaceServices.reconcile();

    const auditPruneTimerRef: { current?: ReturnType<typeof setInterval> } = {};
    cleanup.push(() => {
      clearInterval(auditPruneTimerRef.current);
    });
    const drainController = createDrainController({
      logger,
      timeoutMs: config.timeouts.drainMs,
      handlers: {
        stopAcceptingConnections: async () => {
          taskSchedulerService.stop();
          taskExecutionService.dispose();
          await server.close();
        },
        terminateChildProcesses: async () => {
          if (auditPruneTimerRef.current) {
            clearInterval(auditPruneTimerRef.current);
          }
          taskExecutionService.dispose();
          conversationService.dispose();
          interactiveChatWatchdogService.dispose();
          systemVersionService.stop();
          taskSchedulerService.stop();
          sessionArchiveScheduler.stop();
          await sessionArchiveService.dispose();
          try {
            await orchestrator.stop();
          } finally {
            liveRequestService.dispose();
            workspaceWatchService.dispose();
            database.close();
          }
        },
        ...options?.extraDrainHandlers,
        flushLogs: () => {
          flushLogger(logger);
        },
      },
    });
    drainRuntime.drain = drainController.drain;
    context.shutdownRuntime = () => drainController.drain("manual");

    // Prune the per-token audit log on startup, then daily. The interval is
    // unref'd so it never keeps the process alive, and cleared on drain.
    void tokenAuditService.pruneExpired().catch(() => undefined);
    auditPruneTimerRef.current = setInterval(
      () => void tokenAuditService.pruneExpired().catch(() => undefined),
      24 * 60 * 60 * 1000,
    );
    auditPruneTimerRef.current.unref?.();

    await server.listen({ host: config.server.host, port: config.server.port });
    await conversationService.resumeInteractiveChatWatchdogs();
    void taskExecutionService.resumeRunningTaskRuns().catch((error: unknown) => {
      logger.error({ err: error }, "task run monitor resume failed");
    });
    systemVersionService.start();
    taskSchedulerService.start();
    void sessionArchiveScheduler.start();
    if (options?.installSignalHandlers !== false) {
      installSignalHandlers(drainController.drain, logger);
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
  } catch (error) {
    for (const close of cleanup.reverse()) {
      try {
        await close();
      } catch (closeError) {
        logger.error({ err: closeError }, "startup cleanup failed");
      }
    }
    throw error;
  }
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
