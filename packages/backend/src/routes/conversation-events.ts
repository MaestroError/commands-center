import type { ServerResponse } from "node:http";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createConversationService } from "../services/conversation-service.js";

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

export function registerConversationEventRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    logger: context.logger,
    archiveService: context.sessionArchiveService,
    archiveSettingsService: context.sessionArchiveSettingsService,
  });

  app.get(
    "/api/conversations/:conversationId/events",
    {
      schema: {
        params: conversationParamsSchema,
      },
    },
    async (request, reply) => {
      const loaded = await service.resolveConversationAgent(request.params.conversationId);

      // Set SSE headers and take over the raw response
      reply.hijack();
      const raw = reply.raw;

      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const abortController = new AbortController();

      // Clean up when the client disconnects
      request.raw.on("close", () => {
        abortController.abort();
      });

      // Send heartbeat every 15 seconds
      const heartbeatInterval = setInterval(() => {
        if (!raw.destroyed) {
          writeSseEvent(raw, { type: "heartbeat", properties: {} });
        }
      }, 15_000);

      abortController.signal.addEventListener(
        "abort",
        () => {
          clearInterval(heartbeatInterval);
        },
        { once: true },
      );

      // Subscribe to OpenCode events
      context.openCodeEventService.subscribe({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        signal: abortController.signal,
        onEvent: (event) => {
          if (!raw.destroyed) {
            writeSseEvent(raw, event);
          }
        },
        onTitleUpdate: (title) => {
          void service.updateTitle(loaded.conversation.id, title);
        },
      });

      context.liveRequestService?.subscribe({
        conversationId: loaded.conversation.id,
        signal: abortController.signal,
        onEvent: (event) => {
          if (!raw.destroyed) {
            writeSseEvent(raw, event);
          }
        },
      });
    },
  );
}

function writeSseEvent(
  raw: ServerResponse,
  event: { type: string; properties: Record<string, unknown> },
): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`);
}
