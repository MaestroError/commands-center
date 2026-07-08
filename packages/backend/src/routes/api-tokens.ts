import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  apiTokenActivityListResponseSchema,
  apiTokenAuditSettingsSchema,
  apiTokenListResponseSchema,
  apiTokenRecordSchema,
  createApiTokenInputSchema,
  createApiTokenResponseSchema,
  updateApiTokenInputSchema,
} from "@cc/shared/schemas";

import { NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

const apiTokenParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const tokenActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export function registerApiTokenRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = context.apiTokenService;
  const audit = context.tokenAuditService;

  app.get(
    "/api/api-tokens",
    {
      schema: {
        response: {
          200: apiTokenListResponseSchema,
        },
      },
    },
    () => ({ tokens: service.listTokens() }),
  );

  app.post(
    "/api/api-tokens",
    {
      schema: {
        body: createApiTokenInputSchema,
        response: {
          201: createApiTokenResponseSchema,
        },
      },
    },
    (request, reply) => {
      const result = service.createToken(request.body.name, request.body.permissions);

      void reply.status(201);
      return result;
    },
  );

  app.put(
    "/api/api-tokens/:id",
    {
      schema: {
        params: apiTokenParamsSchema,
        body: updateApiTokenInputSchema,
        response: {
          200: apiTokenRecordSchema,
        },
      },
    },
    (request) => {
      const record = service.updateToken(request.params.id, {
        name: request.body.name,
        permissions: request.body.permissions,
      });

      if (!record) {
        throw new NotFoundError("API token not found.");
      }

      return record;
    },
  );

  app.delete(
    "/api/api-tokens/:id",
    {
      schema: {
        params: apiTokenParamsSchema,
      },
    },
    (request, reply) => {
      if (!service.revokeToken(request.params.id)) {
        throw new NotFoundError("API token not found.");
      }

      return reply.status(204).send();
    },
  );

  // --- Per-token audit (Phase 5) -------------------------------------------

  app.get(
    "/api/api-tokens/audit-settings",
    { schema: { response: { 200: apiTokenAuditSettingsSchema } } },
    async () => (audit ? audit.getSettings() : apiTokenAuditSettingsSchema.parse({})),
  );

  app.put(
    "/api/api-tokens/audit-settings",
    {
      schema: {
        body: apiTokenAuditSettingsSchema,
        response: { 200: apiTokenAuditSettingsSchema },
      },
    },
    async (request) =>
      audit ? audit.setSettings(request.body) : apiTokenAuditSettingsSchema.parse(request.body),
  );

  app.get(
    "/api/api-tokens/:id/activity",
    {
      schema: {
        params: apiTokenParamsSchema,
        querystring: tokenActivityQuerySchema,
        response: { 200: apiTokenActivityListResponseSchema },
      },
    },
    async (request) =>
      audit
        ? audit.listForToken({
            tokenId: request.params.id,
            limit: request.query.limit,
            cursor: request.query.cursor,
          })
        : { entries: [], nextCursor: null },
  );
}
