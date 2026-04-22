import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("mcp server routes", () => {
  it("supports MCP server lifecycle operations", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/mcp-servers",
        payload: {
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
        },
      });

      expect(created.statusCode).toBe(200);
      const createdBody = created.json<{ id: string; name: string; enabled: boolean }>();
      expect(createdBody).toMatchObject({ name: "github", enabled: true });

      const listed = await server.inject({
        method: "GET",
        url: "/api/mcp-servers",
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);

      const updated = await server.inject({
        method: "PATCH",
        url: `/api/mcp-servers/${createdBody.id}`,
        payload: {
          name: "github-updated",
          config: {
            url: "https://example.com/updated-mcp",
            transport: "sse",
            authMethod: "headers",
            headers: [{ key: "X-API-Key", value: "token" }],
          },
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: "github-updated" });

      const disabled = await server.inject({
        method: "PATCH",
        url: `/api/mcp-servers/${createdBody.id}/enabled`,
        payload: { enabled: false },
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json()).toMatchObject({ enabled: false });

      const removed = await server.inject({
        method: "DELETE",
        url: `/api/mcp-servers/${createdBody.id}`,
      });
      expect(removed.statusCode).toBe(204);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns conflicts and not found errors for invalid lifecycle operations", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      scheduler: createSchedulerService(),
    });

    try {
      const first = await server.inject({
        method: "POST",
        url: "/api/mcp-servers",
        payload: {
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
        },
      });

      expect(first.statusCode).toBe(200);

      const duplicate = await server.inject({
        method: "POST",
        url: "/api/mcp-servers",
        payload: {
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/other-mcp",
            transport: "sse",
            authMethod: "headers",
            headers: [{ key: "X-API-Key", value: "secret" }],
          },
        },
      });

      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({
        error: { message: "MCP server 'github' already exists." },
      });

      const missingUpdate = await server.inject({
        method: "PATCH",
        url: "/api/mcp-servers/missing",
        payload: {
          name: "ghost",
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
        },
      });

      expect(missingUpdate.statusCode).toBe(404);

      const missingDelete = await server.inject({
        method: "DELETE",
        url: "/api/mcp-servers/missing",
      });

      expect(missingDelete.statusCode).toBe(404);
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
  } as unknown as OpenCodeService;
}
