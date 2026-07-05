import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createTestDatabase } from "../helpers/db";

describe("system routes", () => {
  it("returns version information", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
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
        message:
          "In-container updates are disabled for Docker installations. Redeploy the container from a newer image to upgrade.",
        restartRequired: false,
        instructions: ["Pull or rebuild a newer image on the host, then recreate the container."],
      }),
    );
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
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

  it("runs a manual version check through the version service", async () => {
    const testDb = await createTestDatabase();
    const checkNow = vi.fn(() =>
      Promise.resolve({
        current: "1.0.0",
        latest: "1.2.0",
        updateAvailable: true,
        installMode: "npm-global" as const,
        autoUpdateEnabled: false,
        autoUpdateSource: "environment" as const,
        checkedAt: "2026-05-07T12:00:00.000Z",
      }),
    );
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(),
        checkNow,
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences: vi.fn(),
        update: vi.fn(),
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({ method: "POST", url: "/api/system/version/check" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        current: "1.0.0",
        latest: "1.2.0",
        updateAvailable: true,
        checkedAt: "2026-05-07T12:00:00.000Z",
      });
      expect(checkNow).toHaveBeenCalledOnce();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("accepts a shutdown request with the runtime shutdown key", async () => {
    const testDb = await createTestDatabase();
    const shutdownRuntime = vi.fn(() => Promise.resolve());
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      shutdownRuntime,
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(),
        checkNow: vi.fn(),
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences: vi.fn(),
        update: vi.fn(),
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/system/shutdown",
        headers: {
          "x-cc-shutdown-key": testDb.config.secretKey,
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: true });
      await new Promise((resolve) => setImmediate(resolve));
      expect(shutdownRuntime).toHaveBeenCalledOnce();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects a shutdown request with an invalid runtime shutdown key", async () => {
    const testDb = await createTestDatabase();
    const shutdownRuntime = vi.fn(() => Promise.resolve());
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      shutdownRuntime,
      systemVersionService: {
        start: vi.fn(),
        stop: vi.fn(),
        getVersion: vi.fn(),
        checkNow: vi.fn(),
        getUpdatePreferences: vi.fn(),
        setUpdatePreferences: vi.fn(),
        update: vi.fn(),
        rollback: vi.fn(),
      },
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/system/shutdown",
        headers: {
          "x-cc-shutdown-key": "wrong-key",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(shutdownRuntime).not.toHaveBeenCalled();
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
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
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
