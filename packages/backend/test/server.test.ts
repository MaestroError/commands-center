import { describe, expect, it, vi } from "vitest";

import {
  createSchedulerService,
  createLogger,
  createServer,
  loadRuntimeConfig,
  type DatabaseClient,
  type EngineStatus,
  type OpenCodeOrchestrator,
  type OpenCodeService,
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
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() => Promise.resolve({ all: [], default: {}, connected: [] })),
    listAuthMethods: vi.fn(() => Promise.resolve({})),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() =>
      Promise.resolve({ url: "https://example.com", method: "auto", instructions: "" }),
    ),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
  } as unknown as OpenCodeService;
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
      url: "http://127.0.0.1:4100",
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
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
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
        scheduler: {
          state: "inactive",
          healthy: true,
          driver: "none",
        },
        opencode: {
          state: "healthy",
          healthy: true,
          url: "http://127.0.0.1:4100",
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
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/project/.cc/workspace",
      restartCount: 0,
      maxRestarts: 3,
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
      database: createDatabase("/tmp/project/.cc/workspace/database/local.db"),
      orchestrator: engine,
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
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

  it("exposes opencode status through a dedicated API route", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const engine = createOrchestrator({
      state: "unhealthy",
      healthy: false,
      url: "http://127.0.0.1:4100",
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
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/opencode",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        state: "unhealthy",
        healthy: false,
        url: "http://127.0.0.1:4100",
        workspaceDir: "/tmp/project/.cc/workspace",
        lastError: "health check failed",
        restartCount: 2,
        maxRestarts: 3,
      });
    } finally {
      await server.close();
    }
  });

  it("returns typed validation errors", async () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });
    const engine = createOrchestrator({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/project/.cc/workspace",
      restartCount: 0,
      maxRestarts: 3,
    });
    const server = await createServer({
      config,
      logger: createLogger(config),
      database: createDatabase("/tmp/project/.cc/workspace/database/local.db"),
      orchestrator: engine,
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/providers/openai/oauth/start",
        payload: { method: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: {
          code: "invalid_request",
          message: "Request validation failed.",
          details: {
            formErrors: [expect.stringContaining("method")],
            fieldErrors: {
              "/method": [expect.stringContaining(">=")],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });
});
