import { describe, expect, it } from "vitest";

import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function setup() {
  const testDb = await createTestDatabase();
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: {} as OpenCodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    scheduler: { getStatus: () => ({ state: "inactive", healthy: true, driver: "none" }) },
  });

  return { testDb, server };
}

describe("task run monitor settings routes", () => {
  it("returns defaults and persists updates", async () => {
    const { testDb, server } = await setup();

    try {
      const initial = await server.inject({
        method: "GET",
        url: "/api/task-run-monitor/settings",
      });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({
        taskRunMonitorMaxLifetimeMinutes: 360,
        taskRunMonitorNoProgressTimeoutMinutes: 30,
        taskRunMonitorUsageLimitFailFastMinutes: 2,
        taskRunMonitorRequeueAfterStall: false,
        taskRunMonitorRequeueLimit: 10,
        taskRunMaxAutoRetries: 10,
      });

      const updated = await server.inject({
        method: "PUT",
        url: "/api/task-run-monitor/settings",
        payload: {
          taskRunMonitorMaxLifetimeMinutes: 120,
          taskRunMonitorNoProgressTimeoutMinutes: 0,
          taskRunMonitorRequeueAfterStall: true,
          taskRunMonitorRequeueLimit: 3,
        },
      });
      expect(updated.statusCode).toBe(200);

      const reloaded = await server.inject({
        method: "GET",
        url: "/api/task-run-monitor/settings",
      });
      expect(reloaded.json()).toEqual({
        taskRunMonitorMaxLifetimeMinutes: 120,
        taskRunMonitorNoProgressTimeoutMinutes: 0,
        taskRunMonitorUsageLimitFailFastMinutes: 2,
        taskRunMonitorRequeueAfterStall: true,
        taskRunMonitorRequeueLimit: 3,
        taskRunMaxAutoRetries: 10,
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("partial PUT preserves unspecified fields", async () => {
    const { testDb, server } = await setup();

    try {
      await server.inject({
        method: "PUT",
        url: "/api/task-run-monitor/settings",
        payload: {
          taskRunMonitorMaxLifetimeMinutes: 90,
          taskRunMonitorNoProgressTimeoutMinutes: 15,
          taskRunMonitorRequeueAfterStall: true,
        },
      });

      const partial = await server.inject({
        method: "PUT",
        url: "/api/task-run-monitor/settings",
        payload: { taskRunMonitorNoProgressTimeoutMinutes: 45 },
      });
      expect(partial.statusCode).toBe(200);

      const reloaded = await server.inject({
        method: "GET",
        url: "/api/task-run-monitor/settings",
      });
      expect(reloaded.json()).toEqual({
        taskRunMonitorMaxLifetimeMinutes: 90,
        taskRunMonitorNoProgressTimeoutMinutes: 45,
        taskRunMonitorUsageLimitFailFastMinutes: 2,
        taskRunMonitorRequeueAfterStall: true,
        taskRunMonitorRequeueLimit: 10,
        taskRunMaxAutoRetries: 10,
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects invalid values", async () => {
    const { testDb, server } = await setup();

    try {
      const negativeLifetime = await server.inject({
        method: "PUT",
        url: "/api/task-run-monitor/settings",
        payload: { taskRunMonitorMaxLifetimeMinutes: 0 },
      });
      expect(negativeLifetime.statusCode).toBe(400);

      const negativeNoProgress = await server.inject({
        method: "PUT",
        url: "/api/task-run-monitor/settings",
        payload: { taskRunMonitorNoProgressTimeoutMinutes: -1 },
      });
      expect(negativeNoProgress.statusCode).toBe(400);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}
