import {
  requestSystemShutdownHeadersSchema,
  systemShutdownAcceptedSchema,
  systemUpdatePreferencesSchema,
  systemUpdateResultSchema,
  systemVersionSchema,
  updateSystemUpdatePreferencesInputSchema,
} from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { ForbiddenError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

export function registerSystemRoutes(server: AppServer, context: RuntimeContext): void {
  if (!context.systemVersionService) {
    return;
  }

  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = context.systemVersionService;

  app.get(
    "/api/system/version",
    {
      schema: {
        response: {
          200: systemVersionSchema,
        },
      },
    },
    () => service.getVersion(),
  );

  app.post(
    "/api/system/shutdown",
    {
      schema: {
        headers: requestSystemShutdownHeadersSchema,
        response: {
          202: systemShutdownAcceptedSchema,
        },
      },
    },
    async (request, reply) => {
      const shutdownRuntime = context.shutdownRuntime;

      if (request.headers["x-cc-shutdown-key"] !== context.config.secretKey) {
        throw new ForbiddenError("Shutdown key is invalid.");
      }

      if (!shutdownRuntime) {
        throw new Error("Runtime shutdown controller is unavailable.");
      }

      await reply.code(202).send({ accepted: true });
      setImmediate(() => {
        void shutdownRuntime().catch((error: unknown) => {
          request.log.error({ err: error }, "runtime shutdown request failed");
        });
      });
    },
  );

  app.post(
    "/api/system/update",
    {
      schema: {
        response: {
          200: systemUpdateResultSchema,
        },
      },
    },
    () => service.update(),
  );

  app.get(
    "/api/system/update-preferences",
    {
      schema: {
        response: {
          200: systemUpdatePreferencesSchema,
        },
      },
    },
    () => service.getUpdatePreferences(),
  );

  app.put(
    "/api/system/update-preferences",
    {
      schema: {
        body: updateSystemUpdatePreferencesInputSchema,
        response: {
          200: systemUpdatePreferencesSchema,
        },
      },
    },
    (request) => service.setUpdatePreferences(request.body),
  );
}
