import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  providerApiKeyInputSchema,
  providerOauthCompleteInputSchema,
  providerOauthStartInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createProviderService } from "../services/provider-service.js";

const providerIdParamsSchema = z.object({
  providerId: z.string().trim().min(1),
});

export function registerProviderRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createProviderService({
    config: context.config,
    opencodeService: context.opencodeService,
  });

  app.get("/api/providers", async () => service.list());

  app.put(
    "/api/providers/:providerId/api-key",
    {
      schema: {
        params: providerIdParamsSchema,
        body: providerApiKeyInputSchema,
      },
    },
    async (request) => ({
      success: await service.setApiKey(request.params.providerId, request.body.apiKey),
    }),
  );

  app.post(
    "/api/providers/:providerId/oauth/start",
    {
      schema: {
        params: providerIdParamsSchema,
        body: providerOauthStartInputSchema,
      },
    },
    async (request) =>
      service.startOauth(request.params.providerId, request.body.method, request.body.inputs),
  );

  app.post(
    "/api/providers/:providerId/oauth/complete",
    {
      schema: {
        params: providerIdParamsSchema,
        body: providerOauthCompleteInputSchema,
      },
    },
    async (request) =>
      service.completeOauth(request.params.providerId, request.body.method, request.body.code),
  );

  app.delete(
    "/api/providers/:providerId",
    {
      schema: {
        params: providerIdParamsSchema,
      },
    },
    async (request) => ({
      success: await service.disconnect(request.params.providerId),
    }),
  );
}
