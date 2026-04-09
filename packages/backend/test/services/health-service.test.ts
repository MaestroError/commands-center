import { describe, expect, it } from "vitest";

import { createHealthService } from "../../src/services/health-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import type { DatabaseClient } from "../../src/db/client";
import type {
  EngineStatus,
  OpenCodeOrchestrator,
} from "../../src/orchestrator/opencode-orchestrator";

describe("createHealthService", () => {
  it("returns ok when engine and scheduler are healthy", () => {
    const config = loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } });
    const service = createHealthService({
      config,
      database: createDatabase(config.database.sqlitePath),
      orchestrator: createOrchestrator({
        state: "healthy",
        healthy: true,
        url: "http://127.0.0.1:4100",
        workspaceDir: config.paths.workspaceDir,
        restartCount: 0,
        maxRestarts: 3,
      }),
      scheduler: createSchedulerService(),
    });

    expect(service.getHealth()).toMatchObject({
      status: "ok",
      database: {
        dialect: "sqlite",
        sqlitePath: config.database.sqlitePath,
      },
      scheduler: {
        state: "inactive",
        healthy: true,
        driver: "none",
      },
      opencode: {
        state: "healthy",
        healthy: true,
      },
    });
  });

  it("returns degraded when the engine is unhealthy", () => {
    const config = loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } });
    const service = createHealthService({
      config,
      database: createDatabase(config.database.sqlitePath),
      orchestrator: createOrchestrator({
        state: "unhealthy",
        healthy: false,
        url: "http://127.0.0.1:4100",
        workspaceDir: config.paths.workspaceDir,
        lastError: "health check failed",
        restartCount: 1,
        maxRestarts: 3,
      }),
      scheduler: createSchedulerService(),
    });

    expect(service.getHealth().status).toBe("degraded");
    expect(service.getEngineStatus()).toMatchObject({
      state: "unhealthy",
      healthy: false,
      lastError: "health check failed",
    });
  });
});

function createDatabase(sqlitePath: string): DatabaseClient {
  return {
    db: {} as DatabaseClient["db"],
    dialect: "sqlite",
    sqlitePath,
    close: () => {},
  };
}

function createOrchestrator(status: EngineStatus): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(status.healthy),
    getStatus: () => status,
  };
}
