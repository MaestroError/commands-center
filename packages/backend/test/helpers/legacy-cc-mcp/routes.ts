import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../../../src/lib/fastify-zod.js";
import type { RuntimeContext } from "../../../src/lib/start-server-runtime.js";
import { createCcManagedMcpServerRegistry } from "../../../src/mcp/cc-managed/server-registry.js";
import { createCcManagedMcpService, type CcManagedMcpService } from "./service.js";
import { createSpecialistService } from "../../../src/services/specialist-service.js";
import { createConversationService } from "../../../src/services/conversation-service.js";
import { createCustomToolActionService } from "../../../src/services/custom-tool-action-service.js";
import { createCustomToolService } from "../../../src/services/custom-tool-service.js";
import { createTaskExecutionService } from "../../../src/services/task-execution-service.js";
import { createTaskContextAttachmentService } from "../../../src/services/task-context-attachment-service.js";
import { createTaskService } from "../../../src/services/task-service.js";

const paramsSchema = z.object({
  serverName: z.string().min(1),
  agentSlug: z.string().min(1),
});

export function registerCcManagedMcpRoutes(server: AppServer, context: RuntimeContext): void {
  const customToolService: ReturnType<typeof createCustomToolService> =
    context.workspaceServices?.customTools ??
    createCustomToolService({
      config: context.config,
      db: context.database.db,
      opencodeService: context.opencodeService,
      listAgents: async () => {
        const agents = await agentService.list();
        return agents.map((agent) => ({
          id: agent.id,
          slug: agent.slug,
          name: agent.name,
          workspacePath: agent.workspacePath,
        }));
      },
    });
  const agentService =
    context.workspaceServices?.specialists ??
    createSpecialistService({
      db: context.database.db,
      config: context.config,
      opencodeService: context.opencodeService,
      customToolService,
    });
  const conversationService = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    logger: context.logger,
    archiveService: context.sessionArchiveService,
    archiveSettingsService: context.sessionArchiveSettingsService,
  });
  const taskService =
    context.taskService ?? createTaskService({ db: context.database.db, config: context.config });
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: context.config,
    taskService,
  });
  const taskExecutionService =
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
  const customToolActionService =
    context.workspaceServices?.customToolActions ??
    createCustomToolActionService({
      customToolService,
      agentService,
    });
  const registry = createCcManagedMcpServerRegistry({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    agentService,
    customToolService,
    customToolActionService,
    conversationService,
    liveRequestService: context.liveRequestService,
    secretService: context.secretService,
    orchestrator: context.orchestrator,
    activityService: context.activityService,
    taskService,
    taskExecutionService,
    sessionArchiveService: context.sessionArchiveService,
    sessionArchiveSettingsService: context.sessionArchiveSettingsService,
  });
  const service = createCcManagedMcpService({
    db: context.database.db,
    config: context.config,
    logger: context.logger,
    registry,
  });

  registerCcManagedMcpServiceRoutes(server, service);
}

export function registerCcManagedMcpServiceRoutes(
  server: AppServer,
  service: CcManagedMcpService,
): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  server.addHook("onClose", async () => {
    await service.close();
  });

  app.post(
    "/api/mcp/cc/:serverName/specialists/:agentSlug",
    {
      schema: {
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      reply.hijack();
      await service.handlePost({
        rawRequest: request.raw,
        rawReply: reply.raw,
        routeServerName: request.params.serverName,
        routeAgentSlug: request.params.agentSlug,
        body: request.body,
      });
    },
  );

  app.get(
    "/api/mcp/cc/:serverName/specialists/:agentSlug",
    {
      schema: {
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      reply.hijack();
      await service.handleGet({
        rawRequest: request.raw,
        rawReply: reply.raw,
        routeServerName: request.params.serverName,
        routeAgentSlug: request.params.agentSlug,
      });
    },
  );

  app.delete(
    "/api/mcp/cc/:serverName/specialists/:agentSlug",
    {
      schema: {
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      reply.hijack();
      await service.handleDelete({
        rawRequest: request.raw,
        rawReply: reply.raw,
        routeServerName: request.params.serverName,
        routeAgentSlug: request.params.agentSlug,
      });
    },
  );
}
