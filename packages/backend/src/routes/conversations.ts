import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  addArtifactInputSchema,
  artifactListResponseSchema,
  artifactSchema,
  pendingInteractionsSchema,
  replyPermissionInputSchema,
  replyQuestionInputSchema,
  resolvedSystemPromptSchema,
  sendConversationCommandInputSchema,
  sendConversationPromptInputSchema,
  sendConversationShellInputSchema,
  CONVERSATION_MESSAGE_PAGE_MAX,
  CONVERSATION_MESSAGE_PAGE_SIZE,
  usageTotalsSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createArtifactService } from "../services/artifact-service.js";
import { createConversationService } from "../services/conversation-service.js";
import { createUsageService } from "../services/usage-service.js";

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

const conversationRequestParamsSchema = z.object({
  conversationId: z.string().min(1),
  requestId: z.string().min(1),
});

const agentConversationParamsSchema = agentIdParamsSchema.extend({
  conversationId: z.string().min(1),
});

export function registerConversationRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const usageService = createUsageService({ db: context.database.db });
  const service = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    logger: context.logger,
    archiveService: context.sessionArchiveService,
    archiveSettingsService: context.sessionArchiveSettingsService,
    systemPromptService: context.systemPromptService,
    interactiveChatWatchdogService: context.interactiveChatWatchdogService,
  });
  const artifactService = createArtifactService({
    db: context.database.db,
    config: context.config,
  });

  app.get(
    "/api/conversations/:conversationId/artifacts",
    {
      schema: {
        params: conversationParamsSchema,
        response: {
          200: artifactListResponseSchema,
        },
      },
    },
    async (request) => ({
      artifacts: await artifactService.listByConversation(request.params.conversationId),
    }),
  );

  app.post(
    "/api/conversations/:conversationId/artifacts",
    {
      schema: {
        params: conversationParamsSchema,
        body: addArtifactInputSchema,
        response: {
          200: artifactSchema,
        },
      },
    },
    async (request) =>
      artifactService.create({
        conversationId: request.params.conversationId,
        ...request.body,
      }),
  );

  app.get(
    "/api/specialists/:id/conversations/active",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => service.resolveCurrent(request.params.id),
  );

  app.get(
    "/api/specialists/:id/conversations",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => service.list(request.params.id),
  );

  app.get(
    "/api/specialists/:id/conversations/:conversationId",
    {
      schema: {
        params: agentConversationParamsSchema,
      },
    },
    async (request) => service.get(request.params.id, request.params.conversationId),
  );

  app.delete(
    "/api/specialists/:id/conversations/:conversationId",
    {
      schema: {
        params: agentConversationParamsSchema,
      },
    },
    async (request, reply) => {
      await service.deleteConversation(request.params.id, request.params.conversationId);
      reply.code(204);
    },
  );

  app.post(
    "/api/specialists/:id/conversations/start-fresh",
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
        querystring: z.object({
          stream: z.enum(["true", "false"]).optional(),
        }),
      },
      bodyLimit: 50 * 1024 * 1024, // 50 MB for base64 attachments
    },
    async (request, reply) => {
      if (request.query.stream === "true") {
        await service.sendPromptAsync(request.params.conversationId, request.body);
        reply.code(202);
        return { accepted: true };
      }

      return service.sendPrompt(request.params.conversationId, request.body);
    },
  );

  app.get(
    "/api/conversations/:conversationId/system-prompts",
    {
      schema: {
        params: conversationParamsSchema,
        response: { 200: z.array(resolvedSystemPromptSchema) },
      },
    },
    async (request) => service.getConversationSystemPrompts(request.params.conversationId),
  );

  app.patch(
    "/api/conversations/:conversationId/system-prompts/:id",
    {
      schema: {
        params: conversationParamsSchema.extend({ id: z.string().min(1) }),
        body: z.object({ enabled: z.boolean() }),
        response: { 200: z.array(resolvedSystemPromptSchema) },
      },
    },
    async (request) =>
      service.setConversationSystemPromptEnabled(
        request.params.conversationId,
        request.params.id,
        request.body.enabled,
      ),
  );

  // Older messages, oldest-first, for scrolling back through a long conversation.
  app.get(
    "/api/conversations/:conversationId/messages",
    {
      schema: {
        params: conversationParamsSchema,
        querystring: z.object({
          before: z.string().min(1),
          limit: z.coerce.number().int().min(1).max(CONVERSATION_MESSAGE_PAGE_MAX).optional(),
        }),
      },
    },
    async (request) =>
      service.listOlderMessages(
        request.params.conversationId,
        request.query.before,
        request.query.limit ?? CONVERSATION_MESSAGE_PAGE_SIZE,
      ),
  );

  // Full, untrimmed parts for one message — the conversation payload ships tool
  // output truncated, and expanding a card asks for the rest here.
  app.get(
    "/api/conversations/:conversationId/messages/:messageId/parts",
    {
      schema: {
        params: conversationParamsSchema.extend({ messageId: z.string().min(1) }),
      },
    },
    async (request) =>
      service.getMessageParts(request.params.conversationId, request.params.messageId),
  );

  // Token and cost totals for the whole conversation. Aggregated server-side
  // because the client only holds the newest page of messages.
  app.get(
    "/api/conversations/:conversationId/usage",
    {
      schema: {
        params: conversationParamsSchema,
        querystring: z.object({
          // Sync the OpenCode session into SQLite first. Needed after a
          // streaming turn, which persists nothing on its own.
          sync: z.coerce.boolean().optional(),
        }),
        response: {
          200: usageTotalsSchema,
        },
      },
    },
    async (request) => {
      if (request.query.sync) {
        await service.syncConversationMessages(request.params.conversationId);
      }

      return usageService.getConversationUsage(request.params.conversationId);
    },
  );

  app.get(
    "/api/conversations/:conversationId/media",
    {
      schema: {
        params: conversationParamsSchema,
      },
    },
    async (request) => service.getMedia(request.params.conversationId),
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
    "/api/conversations/:conversationId/summarize",
    {
      schema: {
        params: conversationParamsSchema,
      },
    },
    async (request) => service.summarize(request.params.conversationId),
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

  app.post(
    "/api/conversations/:conversationId/abort",
    {
      schema: {
        params: conversationParamsSchema,
      },
    },
    async (request, reply) => {
      await service.abortConversation(request.params.conversationId);
      reply.code(204);
    },
  );

  app.get(
    "/api/conversations/:conversationId/pending-interactions",
    {
      schema: {
        params: conversationParamsSchema,
        response: { 200: pendingInteractionsSchema },
      },
    },
    async (request) => {
      const { permissions, question, questions } = await service.listPendingInteractions(
        request.params.conversationId,
      );

      return {
        permissions,
        question,
        questions,
        liveRequests:
          context.liveRequestService?.listByConversation(request.params.conversationId) ?? [],
      };
    },
  );

  app.post(
    "/api/conversations/:conversationId/permissions/:requestId/reply",
    {
      schema: {
        params: conversationRequestParamsSchema,
        body: replyPermissionInputSchema,
      },
    },
    async (request, reply) => {
      await service.replyPermission(
        request.params.conversationId,
        request.params.requestId,
        request.body.reply,
      );
      reply.code(204);
    },
  );

  app.post(
    "/api/conversations/:conversationId/questions/:requestId/reply",
    {
      schema: {
        params: conversationRequestParamsSchema,
        body: replyQuestionInputSchema,
      },
    },
    async (request, reply) => {
      await service.replyQuestion(
        request.params.conversationId,
        request.params.requestId,
        request.body.answers,
      );
      reply.code(204);
    },
  );

  app.post(
    "/api/conversations/:conversationId/questions/:requestId/reject",
    {
      schema: {
        params: conversationRequestParamsSchema,
      },
    },
    async (request, reply) => {
      await service.rejectQuestion(request.params.conversationId, request.params.requestId);
      reply.code(204);
    },
  );
}
