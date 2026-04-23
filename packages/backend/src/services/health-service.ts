import { engineStatusSchema, healthResponseSchema, type HealthResponse } from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { DatabaseClient } from "../db/client.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import type { SchedulerService } from "./scheduler-service.js";

export type HealthService = ReturnType<typeof createHealthService>;

export function createHealthService(options: {
  config: RuntimeConfig;
  database: DatabaseClient;
  orchestrator: OpenCodeOrchestrator;
  scheduler: SchedulerService;
}) {
  return {
    getHealth(): HealthResponse {
      const opencode = engineStatusSchema.parse(options.orchestrator.getStatus());
      const scheduler = options.scheduler.getStatus();

      return healthResponseSchema.parse({
        status: opencode.healthy && scheduler.healthy ? "ok" : "degraded",
        workspaceDir: options.config.paths.workspaceDir,
        database: {
          dialect: options.database.dialect,
          sqlitePath: options.database.sqlitePath,
        },
        opencode,
        scheduler,
      });
    },

    getEngineStatus() {
      return engineStatusSchema.parse(options.orchestrator.getStatus());
    },
  };
}
