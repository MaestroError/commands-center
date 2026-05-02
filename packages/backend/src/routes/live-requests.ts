import {
  liveRequestCancelInputSchema,
  liveRequestResolveInputSchema,
  liveRequestResolveResultSchema,
} from "@cc/shared/schemas";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import { NotFoundError } from "../lib/api-error.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

const paramsSchema = z.object({
  conversationId: z.string().min(1),
  requestId: z.string().min(1),
});

export function registerLiveRequestRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/api/conversations/:conversationId/live-requests/:requestId/resolve",
    {
      schema: {
        params: paramsSchema,
        body: liveRequestResolveInputSchema,
        response: {
          200: liveRequestResolveResultSchema,
        },
      },
    },
    (request) => {
      if (!context.liveRequestService) {
        throw new NotFoundError("Live request not found.");
      }

      context.liveRequestService.resolve(
        request.params.conversationId,
        request.params.requestId,
        request.body,
      );
      return { ok: true as const };
    },
  );

  app.post(
    "/api/conversations/:conversationId/live-requests/:requestId/cancel",
    {
      schema: {
        params: paramsSchema,
        body: liveRequestCancelInputSchema,
        response: {
          200: liveRequestResolveResultSchema,
        },
      },
    },
    (request) => {
      if (!context.liveRequestService) {
        throw new NotFoundError("Live request not found.");
      }

      context.liveRequestService.cancel(
        request.params.conversationId,
        request.params.requestId,
        request.body.reason,
      );
      return { ok: true as const };
    },
  );
}
