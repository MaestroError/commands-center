import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { setMcpServerEnabledInputSchema } from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createMcpServerService } from "../services/mcp-server-service.js";
import { createMcpServerInputSchema, updateMcpServerInputSchema } from "../schemas/mcp.js";

const mcpServerParamsSchema = z.object({
  mcpServerId: z.string().trim().min(1),
});

const mcpAuthCallbackInputSchema = z.object({
  code: z.string().trim().min(1),
});

export function registerMcpServerRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createMcpServerService({
    db: context.database.db,
    config: context.config,
    orchestrator: context.orchestrator,
    opencodeService: context.opencodeService,
  });

  app.get("/api/mcp-servers", async () => service.list());

  app.post(
    "/api/mcp-servers",
    {
      schema: {
        body: createMcpServerInputSchema,
      },
    },
    async (request) => service.create(request.body),
  );

  app.patch(
    "/api/mcp-servers/:mcpServerId",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: updateMcpServerInputSchema,
      },
    },
    async (request) => service.update(request.params.mcpServerId, request.body),
  );

  app.patch(
    "/api/mcp-servers/:mcpServerId/enabled",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: setMcpServerEnabledInputSchema,
      },
    },
    async (request) => service.setEnabled(request.params.mcpServerId, request.body.enabled),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/start",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.startAuth(request.params.mcpServerId),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/authenticate",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.authenticate(request.params.mcpServerId),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/callback",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: mcpAuthCallbackInputSchema,
      },
    },
    async (request) => service.completeAuth(request.params.mcpServerId, request.body.code),
  );

  app.delete(
    "/api/mcp-servers/:mcpServerId/auth",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.removeAuth(request.params.mcpServerId),
  );

  app.delete(
    "/api/mcp-servers/:mcpServerId",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request, reply) => {
      await service.remove(request.params.mcpServerId);
      return reply.status(204).send();
    },
  );
}
