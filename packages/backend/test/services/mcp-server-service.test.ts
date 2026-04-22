import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createMcpServerService } from "../../src/services/mcp-server-service";
import { ConflictError, NotFoundError } from "../../src/lib/api-error";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("mcp-server-service", () => {
  it("persists MCP servers and syncs the global opencode config", async () => {
    const testDb = await createTestDatabase();
    const orchestrator = createOrchestrator();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator,
      opencodeService: createMockOpenCodeService(),
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
      opencodeService: createMockOpenCodeService(),
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
      opencodeService: createMockOpenCodeService(),
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
      opencodeService: createMockOpenCodeService(),
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
      opencodeService: createMockOpenCodeService(),
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

  it("renders stdio MCP servers as local command config", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
    });

    try {
      await service.create({
        name: "filesystem",
        enabled: true,
        config: {
          transport: "stdio",
          command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp/workspace"],
          environment: {
            NODE_ENV: "test",
          },
        },
      });

      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");
      const rendered = JSON.parse(await readFile(configPath, "utf8")) as {
        mcp: Record<string, Record<string, unknown>>;
      };

      expect(rendered.mcp["filesystem"]).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp/workspace"],
        enabled: true,
        environment: {
          NODE_ENV: "test",
        },
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns runtime status and tools and supports auth flows", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(),
      opencodeService,
    });

    try {
      const created = await service.create({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      expect(created.runtimeStatus).toEqual({ status: "needs_auth" });
      expect(created.tools).toEqual([
        { id: "github_create_issue", name: "create_issue" },
        { id: "github_list_issues", name: "list_issues" },
      ]);

      const authStart = await service.startAuth(created.id);
      expect(authStart).toEqual({ authorizationUrl: "https://example.com/oauth" });

      const completed = await service.completeAuth(created.id, "done");
      expect(completed.runtimeStatus).toEqual({ status: "connected" });

      const removed = await service.removeAuth(created.id);
      expect(removed).toEqual({ success: true });
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

function createMockOpenCodeService(): OpenCodeService {
  let authenticated = false;

  return {
    listMcpStatus: vi.fn(() =>
      Promise.resolve({
        github: authenticated ? { status: "connected" } : { status: "needs_auth" },
      }),
    ),
    listMcpToolIds: vi.fn(() =>
      Promise.resolve(["github_create_issue", "github_list_issues", "other_tool"]),
    ),
    startMcpAuth: vi.fn(() => Promise.resolve({ authorizationUrl: "https://example.com/oauth" })),
    completeMcpAuth: vi.fn(() => {
      authenticated = true;
      return Promise.resolve({ status: "connected" as const });
    }),
    removeMcpAuth: vi.fn(() => Promise.resolve({ success: true as const })),
  } as unknown as OpenCodeService;
}
