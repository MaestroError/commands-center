import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createPublicMcpRegistry } from "../mcp/public/registry.js";
import { createPublicMcpRunService } from "../mcp/public/run-service.js";
import { createPublicMcpService } from "../mcp/public/service.js";
import { createPublicMcpTemplateToolBuilder } from "../mcp/public/template-tools.js";
import { createConversationService } from "../services/conversation-service.js";
import { createPublicMcpSettingsService } from "../services/public-mcp-settings-service.js";
import { createPublicTaskApiService } from "../services/public-task-api-service.js";
import { createSpecialistService } from "../services/specialist-service.js";
import { createTaskContextAttachmentService } from "../services/task-context-attachment-service.js";
import { createTaskExecutionService } from "../services/task-execution-service.js";
import { createTaskService } from "../services/task-service.js";

// Matches the internal upload route, leaving base64 headroom over the 10 MB
// per-attachment file cap (used by Phase 3 file args).
const MCP_BODY_LIMIT = 14 * 1024 * 1024;

export const PUBLIC_MCP_PATH = "/api/public/mcp";

export function registerPublicMcpRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server;

  const taskService =
    context.taskService ?? createTaskService({ db: context.database.db, config: context.config });
  const conversationService = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    logger: context.logger,
    archiveService: context.sessionArchiveService,
    archiveSettingsService: context.sessionArchiveSettingsService,
  });
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: context.config,
    taskService,
  });
  const executionService =
    context.taskExecutionService ??
    createTaskExecutionService({
      db: context.database.db,
      taskService,
      conversationService,
      orchestrator: context.orchestrator,
      taskContextAttachmentService,
      logger: context.logger,
      archiveService: context.sessionArchiveService,
      archiveSettingsService: context.sessionArchiveSettingsService,
    });
  const agentService = createSpecialistService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });

  const publicTaskApiService = createPublicTaskApiService({
    taskService,
    executionService,
    taskContextAttachmentService,
    agentService,
  });
  const settingsService = createPublicMcpSettingsService({
    config: context.config,
    logger: context.logger,
  });
  // Resolve the sync-wait cap from settings, cached briefly so concurrent tools
  // polling every second don't each re-read the file.
  let capCache: { atMs: number; value: number } | undefined;
  const resolveCapMs = async (): Promise<number> => {
    const nowMs = Date.now();
    if (capCache && nowMs - capCache.atMs < 5_000) {
      return capCache.value;
    }
    const settings = await settingsService.get();
    const value = settings.syncToolWaitCapSeconds * 1000;
    capCache = { atMs: nowMs, value };
    return value;
  };
  const runService = createPublicMcpRunService({ taskService, resolveCapMs });
  const registry = createPublicMcpRegistry({ service: publicTaskApiService, runService });
  const templateToolBuilder = createPublicMcpTemplateToolBuilder({
    taskService,
    executionService,
    taskContextAttachmentService,
    runService,
  });
  const service = createPublicMcpService({
    logger: context.logger,
    registry,
    templateToolBuilder,
  });

  async function dispatch(
    kind: "post" | "get" | "delete",
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.apiToken;

    if (!token) {
      void reply.status(401).send({ error: { code: "unauthorized", message: "Token required." } });
      return;
    }

    reply.hijack();
    const routeContext = {
      rawRequest: request.raw,
      rawReply: reply.raw,
      token,
      body: kind === "post" ? request.body : undefined,
    };

    if (kind === "post") {
      await service.handlePost(routeContext);
    } else if (kind === "get") {
      await service.handleGet(routeContext);
    } else {
      await service.handleDelete(routeContext);
    }
  }

  app.post(PUBLIC_MCP_PATH, { bodyLimit: MCP_BODY_LIMIT }, (request, reply) =>
    dispatch("post", request, reply),
  );
  app.get(PUBLIC_MCP_PATH, (request, reply) => dispatch("get", request, reply));
  app.delete(PUBLIC_MCP_PATH, (request, reply) => dispatch("delete", request, reply));
}
