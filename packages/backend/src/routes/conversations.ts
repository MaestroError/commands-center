import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  sendConversationCommandInputSchema,
  sendConversationPromptInputSchema,
  sendConversationShellInputSchema,
} from "../schemas/conversations.js";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createConversationService } from "../services/conversation-service.js";

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

const agentConversationParamsSchema = agentIdParamsSchema.extend({
  conversationId: z.string().min(1),
});

export function registerConversationRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createConversationService({
    db: context.database.db,
    opencodeService: context.opencodeService,
  });

  app.get(
    "/api/agents/:id/conversations/active",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => service.resolveCurrent(request.params.id),
  );

  app.get(
    "/api/agents/:id/conversations",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => service.list(request.params.id),
  );

  app.get(
    "/api/agents/:id/conversations/:conversationId",
    {
      schema: {
        params: agentConversationParamsSchema,
      },
    },
    async (request) => service.get(request.params.id, request.params.conversationId),
  );

  app.post(
    "/api/agents/:id/conversations/start-fresh",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.startFresh(request.params.id);
    },
  );

  app.post(
    "/api/conversations/:conversationId/prompt",
    {
      schema: {
        params: conversationParamsSchema,
        body: sendConversationPromptInputSchema,
      },
    },
    async (request) => service.sendPrompt(request.params.conversationId, request.body),
  );

  app.post(
    "/api/conversations/:conversationId/command",
    {
      schema: {
        params: conversationParamsSchema,
        body: sendConversationCommandInputSchema,
      },
    },
    async (request) => service.sendCommand(request.params.conversationId, request.body),
  );

  app.post(
    "/api/conversations/:conversationId/shell",
    {
      schema: {
        params: conversationParamsSchema,
        body: sendConversationShellInputSchema,
      },
    },
    async (request) => service.sendShell(request.params.conversationId, request.body),
  );
}
