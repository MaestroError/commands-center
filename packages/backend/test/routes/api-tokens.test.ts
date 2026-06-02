import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeEventService } from "../../src/services/opencode-event-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";

describe("api token routes", () => {
  it("creates and lists API tokens without returning raw tokens in the list", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await createRouteServer({ testDb, apiTokenService });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/api-tokens",
        payload: { name: "Release automation", scopes: ["templates", "tasks"] },
      });
      const listed = await server.inject({ method: "GET", url: "/api/api-tokens" });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        token: expect.stringMatching(/^cc_/),
        record: { name: "Release automation", scopes: ["templates", "tasks"] },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        tokens: [{ name: "Release automation", scopes: ["templates", "tasks"] }],
      });
      expect(JSON.stringify(listed.json())).not.toContain(created.json().token);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("revokes API tokens", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await createRouteServer({ testDb, apiTokenService });

    try {
      const created = apiTokenService.createToken("Tasks", ["tasks"]);
      const response = await server.inject({
        method: "DELETE",
        url: `/api/api-tokens/${created.record.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(apiTokenService.listTokens()[0]?.revokedAt).toEqual(expect.any(Number));
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 when revoking a missing API token", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await createRouteServer({ testDb, apiTokenService });

    try {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/api-tokens/missing",
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "not_found", message: "API token not found." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createRouteServer(options: {
  testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  apiTokenService: ReturnType<typeof createApiTokenService>;
}) {
  return createServer({
    config: options.testDb.config,
    logger: createLogger(options.testDb.config),
    database: options.testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: createMockOpenCodeEventService(),
    secretService: createSecretService({
      db: options.testDb.client.db,
      config: options.testDb.config,
    }),
    apiTokenService: options.apiTokenService,
    scheduler: createSchedulerService(),
  });
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: () => {},
    disposeGlobal: () => {},
  } as unknown as OpenCodeService;
}

function createMockOpenCodeEventService(): OpenCodeEventService {
  return {
    subscribe: () => {},
  } as unknown as OpenCodeEventService;
}
