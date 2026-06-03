import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  apiTokenListResponseSchema,
  createApiTokenInputSchema,
  createApiTokenResponseSchema,
} from "@cc/shared/schemas";

import { NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

const apiTokenParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export function registerApiTokenRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = context.apiTokenService;

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
      const result = service.createToken(request.body.name, request.body.scopes);

      void reply.status(201);
      return result;
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
}
