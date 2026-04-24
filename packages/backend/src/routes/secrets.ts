import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { secretMetaListSchema, setSecretRequestSchema } from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

const secretKeyParamsSchema = z.object({
  secretKey: z.string().trim().min(1),
});

export function registerSecretRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/api/secrets",
    {
      schema: {
        response: {
          200: secretMetaListSchema,
        },
      },
    },
    async () => context.secretService.list(),
  );

  app.put(
    "/api/secrets/:secretKey",
    {
      schema: {
        params: secretKeyParamsSchema,
        body: setSecretRequestSchema,
      },
    },
    async (request, reply) => {
      await context.secretService.set(request.params.secretKey, request.body.value);
      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/secrets/:secretKey",
    {
      schema: {
        params: secretKeyParamsSchema,
      },
    },
    async (request, reply) => {
      await context.secretService.delete(request.params.secretKey);
      return reply.status(204).send();
    },
  );
}
