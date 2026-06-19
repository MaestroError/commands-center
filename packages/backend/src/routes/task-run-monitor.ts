import { z } from "zod";
import { taskRunMonitorSettingsSchema } from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createTaskRunMonitorSettingsService } from "../services/task-run-monitor-settings-service.js";

// Patch schema: all fields optional so missing fields stay undefined and the
// handler can merge them over the existing persisted settings.
const taskRunMonitorSettingsPatchSchema = z.object({
  taskRunMonitorMaxLifetimeMinutes: z.number().int().positive().optional(),
  taskRunMonitorNoProgressTimeoutMinutes: z.number().int().nonnegative().optional(),
  taskRunMonitorRequeueAfterStall: z.boolean().optional(),
});

export function registerTaskRunMonitorRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const settingsService =
    context.taskRunMonitorSettingsService ??
    createTaskRunMonitorSettingsService({ config: context.config, logger: context.logger });

  app.get(
    "/api/task-run-monitor/settings",
    {
      schema: {
        response: {
          200: taskRunMonitorSettingsSchema,
        },
      },
    },
    async () => settingsService.get(),
  );

  app.put(
    "/api/task-run-monitor/settings",
    {
      schema: {
        body: taskRunMonitorSettingsPatchSchema,
        response: {
          200: taskRunMonitorSettingsSchema,
        },
      },
    },
    async (request) => {
      const current = await settingsService.get();
      return settingsService.update({ ...current, ...request.body });
    },
  );
}
