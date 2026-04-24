import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("provider routes", () => {
  it("lists providers and supports connect flows", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const listed = await server.inject({
        method: "GET",
        url: "/api/providers",
      });
      const apiKey = await server.inject({
        method: "PUT",
        url: "/api/providers/openai/api-key",
        payload: { apiKey: "secret" },
      });
      const oauthStart = await server.inject({
        method: "POST",
        url: "/api/providers/openai/oauth/start",
        payload: { method: 0 },
      });
      const oauthComplete = await server.inject({
        method: "POST",
        url: "/api/providers/openai/oauth/complete",
        payload: { method: 0, code: "done" },
      });
      const disconnected = await server.inject({
        method: "DELETE",
        url: "/api/providers/openai",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject([
        {
          provider: { id: "openai" },
          connected: true,
        },
      ]);
      expect(apiKey.json()).toEqual({ success: true });
      expect(oauthStart.json()).toEqual({
        url: "https://provider.example/authorize",
        method: "auto",
        instructions: "Finish login in the opened browser window.",
      });
      expect(oauthComplete.json()).toEqual({
        connected: true,
        pending: false,
        message: "Connected openai",
      });
      expect(disconnected.json()).toEqual({ success: true });
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

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),

    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "api",
            env: ["OPENAI_API_KEY"],
            models: { "openai/gpt-4.1": { name: "GPT-4.1" } },
          },
        ],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    ),

    listAuthMethods: vi.fn(() =>
      Promise.resolve({
        openai: [{ type: "oauth", label: "Browser OAuth" }],
      }),
    ),

    setApiKey: vi.fn(() => Promise.resolve(true)),

    startOauth: vi.fn(() =>
      Promise.resolve({
        url: "https://provider.example/authorize",
        method: "auto",
        instructions: "Finish login in the opened browser window.",
      }),
    ),

    completeOauth: vi.fn(() => Promise.resolve(true)),

    disconnectProvider: vi.fn(() => Promise.resolve(true)),
  } as unknown as OpenCodeService;
}
