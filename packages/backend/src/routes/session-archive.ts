import { sessionArchiveSettingsSchema } from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createSessionArchiveSettingsService } from "../services/session-archive-settings-service.js";

export function registerSessionArchiveRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const settingsService =
    context.sessionArchiveSettingsService ??
    createSessionArchiveSettingsService({ config: context.config, logger: context.logger });

  app.get(
    "/api/session-archive/settings",
    {
      schema: {
        response: {
          200: sessionArchiveSettingsSchema,
        },
      },
    },
    async () => settingsService.get(),
  );

  app.put(
    "/api/session-archive/settings",
    {
      schema: {
        body: sessionArchiveSettingsSchema,
        response: {
          200: sessionArchiveSettingsSchema,
        },
      },
    },
    async (request) => settingsService.update(request.body),
  );
}
