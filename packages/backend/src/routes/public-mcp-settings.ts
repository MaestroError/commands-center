import { z } from "zod";
import { publicMcpSettingsSchema } from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createPublicMcpSettingsService } from "../services/public-mcp-settings-service.js";

// Patch schema: all fields optional so missing fields merge over the persisted
// settings (mirrors the task-run-monitor settings route).
const publicMcpSettingsPatchSchema = z.object({
  syncToolWaitCapSeconds: z.number().int().min(0).max(600).optional(),
});

export function registerPublicMcpSettingsRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const settingsService = createPublicMcpSettingsService({
    config: context.config,
    logger: context.logger,
  });

  app.get(
    "/api/public-mcp/settings",
    { schema: { response: { 200: publicMcpSettingsSchema } } },
    async () => settingsService.get(),
  );

  app.put(
    "/api/public-mcp/settings",
    {
      schema: {
        body: publicMcpSettingsPatchSchema,
        response: { 200: publicMcpSettingsSchema },
      },
    },
    async (request) => {
      const current = await settingsService.get();
      return settingsService.update({ ...current, ...request.body });
    },
  );
}
