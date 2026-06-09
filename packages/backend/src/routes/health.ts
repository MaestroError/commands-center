import { engineStatusSchema, healthResponseSchema } from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createHealthService } from "../services/health-service.js";

export function registerHealthRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createHealthService({
    config: context.config,
    database: context.database,
    orchestrator: context.orchestrator,
    scheduler: context.scheduler,
  });

  app.get(
    "/api/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    () => service.getHealth(),
  );

  app.get(
    "/api/opencode",
    {
      schema: {
        response: {
          200: engineStatusSchema,
        },
      },
    },
    () => service.getEngineStatus(),
  );

  app.post(
    "/api/opencode/restart",
    {
      schema: {
        response: {
          202: engineStatusSchema,
        },
      },
    },
    (request, reply) => {
      void context.orchestrator.restart("manual restart requested").catch((error: unknown) => {
        request.log.error({ err: error }, "manual opencode restart failed");
      });
      reply.code(202);
      return service.getEngineStatus();
    },
  );
}
