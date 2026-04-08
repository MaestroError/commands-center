import { z } from "zod";

import type { FastifyReply } from "fastify";

import {
  providerApiKeyInputSchema,
  providerOauthCompleteInputSchema,
  providerOauthStartInputSchema,
} from "@cc/shared/schemas";

import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createProviderService } from "../services/provider-service.js";

const providerIdParamsSchema = z.object({
  providerId: z.string().trim().min(1),
});

type RouteServer = {
  get(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  put(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  post(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  delete(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
};

export function registerProviderRoutes(server: RouteServer, context: RuntimeContext): void {
  const service = createProviderService({
    config: context.config,
    opencodeService: context.opencodeService,
  });

  server.get("/api/providers", async () => {
    return service.list();
  });

  server.put("/api/providers/:providerId/api-key", async (request, reply) => {
    const params = parseOrReply(providerIdParamsSchema, request.params, reply);
    const body = parseOrReply(providerApiKeyInputSchema, request.body, reply);

    if (!params || !body) {
      return;
    }

    return {
      success: await service.setApiKey(params.providerId, body.apiKey),
    };
  });

  server.post("/api/providers/:providerId/oauth/start", async (request, reply) => {
    const params = parseOrReply(providerIdParamsSchema, request.params, reply);
    const body = parseOrReply(providerOauthStartInputSchema, request.body, reply);

    if (!params || !body) {
      return;
    }

    return service.startOauth(params.providerId, body.method, body.inputs);
  });

  server.post("/api/providers/:providerId/oauth/complete", async (request, reply) => {
    const params = parseOrReply(providerIdParamsSchema, request.params, reply);
    const body = parseOrReply(providerOauthCompleteInputSchema, request.body, reply);

    if (!params || !body) {
      return;
    }

    return service.completeOauth(params.providerId, body.method, body.code);
  });

  server.delete("/api/providers/:providerId", async (request, reply) => {
    const params = parseOrReply(providerIdParamsSchema, request.params, reply);

    if (!params) {
      return;
    }

    return {
      success: await service.disconnect(params.providerId),
    };
  });
}

function parseOrReply<T>(schema: z.ZodType<T>, input: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  reply.code(400);
  void reply.send({
    error: {
      code: "invalid_request",
      message: "Request validation failed.",
      details: parsed.error.flatten(),
    },
  });
  return undefined;
}
