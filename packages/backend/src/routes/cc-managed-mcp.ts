import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createCcManagedMcpService } from "../mcp/cc-managed/service.js";

const paramsSchema = z.object({
  serverName: z.string().min(1),
  agentSlug: z.string().min(1),
});

export function registerCcManagedMcpRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createCcManagedMcpService({
    db: context.database.db,
    config: context.config,
    logger: context.logger,
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
