import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createMcpServerService } from "../../src/services/mcp-server-service";
import { ConflictError, NotFoundError } from "../../src/lib/api-error";
import { createTestDatabase } from "../helpers/db";

describe("mcp-server-service", () => {
  it("persists MCP servers and syncs the global opencode config", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createOrchestrator();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator,
    });

    try {
      const created = await service.create({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer secret" }],
        },
      });

      expect(created).toMatchObject({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer secret" }],
        },
      });

      const listed = await service.list();
      expect(listed).toHaveLength(1);

      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");
      const rendered = JSON.parse(await readFile(configPath, "utf8")) as {
        mcp: Record<string, Record<string, unknown>>;
      };

      expect(rendered.mcp["github"]).toEqual({
        type: "remote",
        url: "https://example.com/mcp",
        enabled: true,
        headers: {
          Authorization: "Bearer secret",
        },
      });
      expect(orchestrator.restart).toHaveBeenCalledWith("mcp server github created");
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates enabled state and removes MCP servers from config", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createOrchestrator();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator,
    });

    try {
      const created = await service.create({
        name: "notion",
        enabled: true,
        config: {
          url: "https://notion.example.com/mcp",
          transport: "sse",
          authMethod: "oauth",
          headers: [],
        },
      });

      const disabled = await service.setEnabled(created.id, false);
      expect(disabled.enabled).toBe(false);

      await service.remove(created.id);

      const listed = await service.list();
      expect(listed).toEqual([]);

      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");
      const rendered = JSON.parse(await readFile(configPath, "utf8")) as {
        mcp: Record<string, Record<string, unknown>>;
      };

      expect(rendered.mcp).toEqual({});
      expect(orchestrator.restart).toHaveBeenCalledTimes(3);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects duplicate MCP server names", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(),
    });

    try {
      await service.create({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "none",
          headers: [],
        },
      });

      await expect(
        service.create({
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/other-mcp",
            transport: "sse",
            authMethod: "headers",
            headers: [{ key: "X-API-Key", value: "secret" }],
          },
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await testDb.cleanup();
    }
  });

  it("throws not found for missing MCP server updates and removals", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(),
    });

    try {
      await expect(
        service.update("missing", {
          name: "ghost",
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(service.setEnabled("missing", false)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await testDb.cleanup();
    }
  });

  it("renders oauth and header variants into the global config", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(),
    });

    try {
      await service.create({
        name: "oauth-server",
        enabled: true,
        config: {
          url: "https://oauth.example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      await service.create({
        name: "plain-server",
        enabled: false,
        config: {
          url: "https://plain.example.com/mcp",
          transport: "sse",
          authMethod: "none",
          headers: [{ key: "X-API-Key", value: "secret" }],
        },
      });

      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");
      const rendered = JSON.parse(await readFile(configPath, "utf8")) as {
        mcp: Record<string, Record<string, unknown>>;
      };

      expect(rendered.mcp["oauth-server"]).toEqual({
        type: "remote",
        url: "https://oauth.example.com/mcp",
        enabled: true,
        oauth: true,
      });
      expect(rendered.mcp["plain-server"]).toEqual({
        type: "remote",
        url: "https://plain.example.com/mcp",
        enabled: false,
        headers: {
          "X-API-Key": "secret",
        },
      });
    } finally {
      await testDb.cleanup();
    }
  });
});

function createOrchestrator() {
  return {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    restart: vi.fn(() => Promise.resolve()),
    refreshHealth: vi.fn(() => Promise.resolve(true)),
    getStatus: vi.fn(() => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    })),
  };
}
