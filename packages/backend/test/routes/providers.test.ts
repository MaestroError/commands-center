import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import { createTestDatabase } from "../helpers/db";

describe("provider routes", () => {
  it("lists providers and supports connect flows", async () => {
    const testDb = await createTestDatabase();
    const calls: string[] = [];
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(calls),
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
      expect(calls).toHaveLength(7);
      expect(calls.slice(0, 2).sort()).toEqual(["/provider", "/provider/auth"]);
      expect(calls.slice(2)).toEqual([
        "/auth/openai",
        "/provider/openai/oauth/authorize",
        "/provider/openai/oauth/callback",
        "/provider",
        "/auth/openai",
      ]);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator(calls: string[]) {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
    createWorkspaceClient: () => ({
      request: <T>(path: string) => {
        calls.push(path);

        if (path === "/provider") {
          return Promise.resolve({
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
          } as T);
        }

        if (path === "/provider/auth") {
          return Promise.resolve({
            openai: [{ type: "oauth", label: "Browser OAuth" }],
          } as T);
        }

        if (path === "/provider/openai/oauth/authorize") {
          return Promise.resolve({
            url: "https://provider.example/authorize",
            method: "auto",
            instructions: "Finish login in the opened browser window.",
          } as T);
        }

        return Promise.resolve(true as T);
      },
      getPath: () => Promise.reject(new Error("not used")),
      disposeInstance: () => Promise.resolve(true),
    }),
    disposeWorkspace: () => Promise.resolve(true),
  };
}
