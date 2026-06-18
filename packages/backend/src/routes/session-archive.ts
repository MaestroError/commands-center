import { z } from "zod";
import { sessionArchiveSettingsSchema } from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createSessionArchiveSettingsService } from "../services/session-archive-settings-service.js";

// Patch schema: all fields optional with no defaults so missing fields stay undefined
// and the handler can merge them with existing persisted settings.
const sessionArchiveSettingsPatchSchema = z.object({
  sessionArchiveEnabled: z.boolean().optional(),
  sessionArchiveAppendMode: z.enum(["off", "debounced"]).optional(),
  sessionArchiveMaterializeIntervalMinutes: z.number().int().positive().optional(),
});

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
        body: sessionArchiveSettingsPatchSchema,
        response: {
          200: sessionArchiveSettingsSchema,
        },
      },
    },
    async (request) => {
      const current = await settingsService.get();
      return settingsService.update({ ...current, ...request.body });
    },
  );
}
