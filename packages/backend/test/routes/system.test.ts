import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";

describe("system routes", () => {
  it("returns version information", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(() =>
          Promise.resolve({
            current: "1.0.0",
            latest: "1.1.0",
            updateAvailable: true,
            installMode: "npm-global" as const,
            autoUpdateEnabled: false,
            autoUpdateSource: "environment" as const,
          }),
        ),
        checkNow: vi.fn(),
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences: vi.fn(),
        update: vi.fn(),
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({ method: "GET", url: "/api/system/version" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        current: "1.0.0",
        latest: "1.1.0",
        updateAvailable: true,
        installMode: "npm-global",
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("runs update through the version service", async () => {
    const testDb = await createTestDatabase();
    const update = vi.fn(() =>
      Promise.resolve({
        applied: false,
        installMode: "docker" as const,
        message: "Docker installations cannot update themselves from inside the container.",
        restartRequired: false,
        instructions: ["docker compose pull"],
      }),
    );
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(),
        checkNow: vi.fn(),
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences: vi.fn(),
        update,
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({ method: "POST", url: "/api/system/update" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        applied: false,
        installMode: "docker",
        restartRequired: false,
      });
      expect(update).toHaveBeenCalledOnce();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("updates auto-update preferences", async () => {
    const testDb = await createTestDatabase();
    const setUpdatePreferences = vi.fn(() =>
      Promise.resolve({
        autoUpdateEnabled: true,
        autoUpdateSource: "settings" as const,
        environmentDefault: false,
      }),
    );
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(),
        checkNow: vi.fn(),
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences,
        update: vi.fn(),
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({
        method: "PUT",
        url: "/api/system/update-preferences",
        payload: { autoUpdateEnabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        autoUpdateEnabled: true,
        autoUpdateSource: "settings",
        environmentDefault: false,
      });
      expect(setUpdatePreferences).toHaveBeenCalledWith({ autoUpdateEnabled: true });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator() {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService() {
  return {
    dispose: vi.fn(),
    disposeGlobal: vi.fn(),
  } as never;
}
