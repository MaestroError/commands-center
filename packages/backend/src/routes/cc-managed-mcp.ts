import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createCcManagedMcpServerRegistry } from "../mcp/cc-managed/server-registry.js";
import { createCcManagedMcpService } from "../mcp/cc-managed/service.js";
import { createAgentService } from "../services/agent-service.js";
import { createConversationService } from "../services/conversation-service.js";
import { createCustomToolService } from "../services/custom-tool-service.js";

const paramsSchema = z.object({
  serverName: z.string().min(1),
  agentSlug: z.string().min(1),
});

export function registerCcManagedMcpRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const customToolService = createCustomToolService({
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
  const agentService = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    customToolService,
  });
  const conversationService = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });
  const registry = createCcManagedMcpServerRegistry({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    customToolService,
    agentService,
    conversationService,
    liveRequestService: context.liveRequestService,
    secretService: context.secretService,
    orchestrator: context.orchestrator,
  });
  const service = createCcManagedMcpService({
    db: context.database.db,
    config: context.config,
    logger: context.logger,
    registry,
  });

  server.addHook("onClose", async () => {
    await service.close();
  });

  app.post(
    "/api/mcp/cc/:serverName/agents/:agentSlug",
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
    "/api/mcp/cc/:serverName/agents/:agentSlug",
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
    "/api/mcp/cc/:serverName/agents/:agentSlug",
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
