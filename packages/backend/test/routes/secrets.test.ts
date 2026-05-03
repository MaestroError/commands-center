import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeEventService } from "../../src/services/opencode-event-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("secret routes", () => {
  it("lists secret metadata", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createMockOrchestrator();
    const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
    const server = await createRouteServer({ testDb, orchestrator, secretService });

    try {
      await secretService.ensure(["CC_EMPTY_TOKEN"]);
      await secretService.set("CC_FILLED_TOKEN", "super-secret");

      const response = await server.inject({
        method: "GET",
        url: "/api/secrets",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([
        { key: "CC_EMPTY_TOKEN", isSet: false },
        { key: "CC_FILLED_TOKEN", isSet: true },
      ]);
      expect(orchestrator.restart).not.toHaveBeenCalled();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("stores non-empty secrets and restarts the orchestrator", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createMockOrchestrator();
    const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
    const server = await createRouteServer({ testDb, orchestrator, secretService });

    try {
      const response = await server.inject({
        method: "PUT",
        url: "/api/secrets/CC_API_TOKEN",
        payload: { value: "super-secret" },
      });

      expect(response.statusCode).toBe(204);
      expect(await secretService.buildEnvMap()).toEqual({ CC_API_TOKEN: "super-secret" });
      expect(orchestrator.restart).toHaveBeenCalledWith("secret updated");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("stores blank secrets without restarting the orchestrator", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createMockOrchestrator();
    const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
    const server = await createRouteServer({ testDb, orchestrator, secretService });

    try {
      const response = await server.inject({
        method: "PUT",
        url: "/api/secrets/CC_EMPTY_TOKEN",
        payload: { value: "" },
      });

      expect(response.statusCode).toBe(204);
      await expect(secretService.list()).resolves.toMatchObject([
        { key: "CC_EMPTY_TOKEN", isSet: true },
      ]);
      expect(orchestrator.restart).not.toHaveBeenCalled();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("deletes secrets and restarts the orchestrator", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createMockOrchestrator();
    const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
    const server = await createRouteServer({ testDb, orchestrator, secretService });

    try {
      await secretService.set("CC_DELETE_ME", "gone-soon");

      const response = await server.inject({
        method: "DELETE",
        url: "/api/secrets/CC_DELETE_ME",
      });

      expect(response.statusCode).toBe(204);
      expect(await secretService.buildEnvMap()).toEqual({});
      expect(orchestrator.restart).toHaveBeenCalledWith("secret deleted");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createRouteServer(options: {
  testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  orchestrator: ReturnType<typeof createMockOrchestrator>;
  secretService: ReturnType<typeof createSecretService>;
}) {
  return createServer({
    config: options.testDb.config,
    logger: createLogger(options.testDb.config),
    database: options.testDb.client,
    orchestrator: options.orchestrator,
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: createMockOpenCodeEventService(),
    secretService: options.secretService,
    scheduler: createSchedulerService(),
  });
}

function createMockOrchestrator(): OpenCodeOrchestrator & { restart: ReturnType<typeof vi.fn> } {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    refreshHealth: vi.fn().mockResolvedValue(true),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(),
    disposeGlobal: vi.fn(),
  } as unknown as OpenCodeService;
}

function createMockOpenCodeEventService(): OpenCodeEventService {
  return {
    subscribe: vi.fn(),
  } as unknown as OpenCodeEventService;
}
