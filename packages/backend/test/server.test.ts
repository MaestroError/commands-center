import { describe, expect, it } from "vitest";

import {
  createLogger,
  createServer,
  loadRuntimeConfig,
  type DatabaseClient,
  type EngineStatus,
  type OpenCodeOrchestrator,
} from "@cc/backend";

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
    createWorkspaceClient: () => ({
      request: () => Promise.resolve(undefined as never),
      getPath: () =>
        Promise.resolve({
          home: "/tmp/home",
          state: "/tmp/state",
          config: "/tmp/config",
          worktree: "/tmp/worktree",
          directory: "/tmp/worktree",
        }),
      disposeInstance: () => Promise.resolve(true),
    }),
    disposeWorkspace: () => Promise.resolve(true),
  };
}

describe("createServer", () => {
  it("returns health information for the bootstrapped runtime", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const engine = createOrchestrator({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/project/.cc/workspace",
      pid: 4321,
      restartCount: 0,
      maxRestarts: 3,
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
      database: createDatabase("/tmp/project/.cc/workspace/database/local.db"),
      orchestrator: engine,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        dataDir: "/tmp/project/.cc",
        workspaceDir: "/tmp/project/.cc/workspace",
        database: {
          dialect: "sqlite",
          sqlitePath: "/tmp/project/.cc/workspace/database/local.db",
        },
        engine: {
          state: "healthy",
          healthy: true,
          url: "http://127.0.0.1:4096",
          workspaceDir: "/tmp/project/.cc/workspace",
          pid: 4321,
          restartCount: 0,
          maxRestarts: 3,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("propagates request correlation ids", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const engine = createOrchestrator({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/project/.cc/workspace",
      restartCount: 0,
      maxRestarts: 3,
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
      database: createDatabase("/tmp/project/.cc/workspace/database/local.db"),
      orchestrator: engine,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          "x-request-id": "req-123",
        },
      });

      expect(response.headers["x-request-id"]).toBe("req-123");
    } finally {
      await server.close();
    }
  });

  it("exposes engine status through a dedicated API route", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const engine = createOrchestrator({
      state: "unhealthy",
      healthy: false,
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/project/.cc/workspace",
      lastError: "health check failed",
      restartCount: 2,
      maxRestarts: 3,
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
      database: createDatabase("/tmp/project/.cc/workspace/database/local.db"),
      orchestrator: engine,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/engine",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        state: "unhealthy",
        healthy: false,
        url: "http://127.0.0.1:4096",
        workspaceDir: "/tmp/project/.cc/workspace",
        lastError: "health check failed",
        restartCount: 2,
        maxRestarts: 3,
      });
    } finally {
      await server.close();
    }
  });
});
