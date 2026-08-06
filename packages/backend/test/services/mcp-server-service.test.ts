import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSpecialistService } from "../../src/services/specialist-service";
import { createMcpServerService, mcpServerReconciler } from "../../src/services/mcp-server-service";
import { createSecretService } from "../../src/services/secret-service";
import { ConflictError, NotFoundError } from "../../src/lib/api-error";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("mcp-server-service", () => {
  it("persists MCP servers and syncs the global opencode config", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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
          headers: [{ key: "Authorization", value: "{env:CC_MCP_GITHUB_HEADER_AUTHORIZATION}" }],
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
        oauth: false,
        headers: {
          Authorization: "{env:CC_MCP_GITHUB_HEADER_AUTHORIZATION}",
        },
      });
      expect(opencodeService.disposeGlobal).toHaveBeenCalled();
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates enabled state and removes MCP servers from config", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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
      expect(opencodeService.disposeGlobal).toHaveBeenCalledTimes(3);
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes deleted MCP servers from agent capabilities and workspaces", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
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
      const agent = await agentService.create({
        name: "Writer",
        role: "write docs",
        instructions: "Use github when needed.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [{ name: "github", enabled: true, action: "deny" }],
          toolPermissions: [{ pattern: "github_create_issue", action: "ask" }],
        },
      });

      await service.remove(created.id);

      const updated = await agentService.get(agent.id);
      expect(updated?.capabilities.mcpServers).toEqual([]);
      expect(updated?.capabilities.toolPermissions).toEqual([]);

      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");
      expect(config).not.toContain('"github"');
      expect(config).not.toContain('"github_create_issue"');
    } finally {
      await testDb.cleanup();
    }
  });

  it("renames MCP references across agent capabilities and workspaces", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
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
      const agent = await agentService.create({
        name: "Reviewer",
        role: "review code",
        instructions: "Use github when needed.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [{ name: "github", enabled: true, action: "deny" }],
          toolPermissions: [{ pattern: "github_create_issue", action: "ask" }],
        },
      });

      await service.update(created.id, {
        name: "github-enterprise",
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      const updated = await agentService.get(agent.id);
      expect(updated?.capabilities.mcpServers).toEqual([
        { name: "github-enterprise", enabled: true, action: "deny" },
      ]);
      expect(updated?.capabilities.toolPermissions).toEqual([
        { pattern: "github-enterprise_create_issue", action: "ask" },
      ]);

      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");
      expect(config).toContain('"github-enterprise": {');
      expect(config).toContain('"github-enterprise_*": "deny"');
      expect(config).toContain('"github-enterprise_create_issue": "ask"');
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects duplicate MCP server names", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const oauthServer = await service.create({
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

      await service.create({
        name: "composio",
        enabled: true,
        config: {
          url: "https://connect.composio.dev/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      // A look-alike domain must NOT be treated as Composio.
      const lookalikeServer = await service.create({
        name: "lookalike",
        enabled: true,
        config: {
          url: "https://notcomposio.dev/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");
      const rendered = JSON.parse(await readFile(configPath, "utf8")) as {
        mcp: Record<string, Record<string, unknown>>;
      };

      // Non-Composio OAuth servers get a CC-hosted redirect so the flow works on a VPS.
      expect(rendered.mcp["oauth-server"]).toEqual({
        type: "remote",
        url: "https://oauth.example.com/mcp",
        enabled: true,
        oauth: {
          redirectUri: `${testDb.config.security.publicOrigin}/api/mcp-servers/${oauthServer.id}/auth/redirect`,
        },
      });
      // Composio OAuth is left untouched (default loopback) — no redirectUri injected.
      expect(rendered.mcp["composio"]).toEqual({
        type: "remote",
        url: "https://connect.composio.dev/mcp",
        enabled: true,
      });
      // notcomposio.dev is not Composio — it still gets the CC-hosted redirect.
      expect(rendered.mcp["lookalike"]).toEqual({
        type: "remote",
        url: "https://notcomposio.dev/mcp",
        enabled: true,
        oauth: {
          redirectUri: `${testDb.config.security.publicOrigin}/api/mcp-servers/${lookalikeServer.id}/auth/redirect`,
        },
      });
      expect(rendered.mcp["plain-server"]).toEqual({
        type: "remote",
        url: "https://plain.example.com/mcp",
        enabled: false,
        oauth: false,
        headers: {
          "X-API-Key": "{env:CC_MCP_PLAIN_SERVER_HEADER_X_API_KEY}",
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
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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
        timeout: 120000,
        environment: {
          NODE_ENV: "{env:CC_MCP_FILESYSTEM_ENV_NODE_ENV}",
        },
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("renders the configured timeout on stdio MCP servers", async () => {
    const testDb = await createTestDatabase();
    const config = {
      ...testDb.config,
      timeouts: { ...testDb.config.timeouts, mcpStdioMs: 45_000 },
    };
    const service = createMcpServerService({
      db: testDb.client.db,
      config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config }),
    });

    try {
      await service.create({
        name: "fetcher",
        enabled: true,
        config: {
          transport: "stdio",
          command: ["npx", "-y", "fetcher-mcp"],
          environment: {},
        },
      });

      const rendered = JSON.parse(
        await readFile(join(testDb.config.paths.workspaceDir, "opencode.jsonc"), "utf8"),
      ) as { mcp: Record<string, Record<string, unknown>> };

      expect(rendered.mcp["fetcher"]?.["timeout"]).toBe(45_000);
    } finally {
      await testDb.cleanup();
    }
  });

  it("keeps the stdio timeout out of portable MCP configuration", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      await service.create({
        name: "fetcher",
        enabled: true,
        config: {
          transport: "stdio",
          command: ["npx", "-y", "fetcher-mcp"],
          environment: {},
        },
      });

      const portable = JSON.parse(
        await readFile(join(testDb.config.paths.subdirectories.configuration, "mcp.json"), "utf8"),
      ) as { servers: Array<{ name: string; config: Record<string, unknown> }> };

      expect(portable.servers).toHaveLength(1);
      const [portableServer] = portable.servers;
      if (!portableServer) {
        throw new Error("Expected the portable fetcher MCP server entry.");
      }
      expect(portableServer.name).toBe("fetcher");
      expect(portableServer.config).not.toHaveProperty("timeout");
    } finally {
      await testDb.cleanup();
    }
  });

  it("flags referenced secrets without values", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const created = await service.create({
        name: "linear",
        enabled: true,
        config: {
          url: "https://linear.example.com/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer {env:CC_LINEAR_TOKEN}" }],
        },
      });

      expect(created.missingSecrets).toEqual(["CC_LINEAR_TOKEN"]);
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
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

  it("authenticates an OAuth MCP server in the browser via opencode", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

      const authenticated = await service.authenticate(created.id);
      expect(opencodeService.authenticateMcp).toHaveBeenCalledWith(
        testDb.config.paths.workspaceDir,
        "github",
      );
      expect(authenticated.runtimeStatus).toEqual({ status: "connected" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("short-circuits authenticate when the MCP server is already connected", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    vi.mocked(opencodeService.listMcpStatus).mockResolvedValue({
      github: { status: "connected" },
    });
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

      vi.mocked(opencodeService.authenticateMcp).mockClear();
      const authenticated = await service.authenticate(created.id);
      expect(opencodeService.authenticateMcp).not.toHaveBeenCalled();
      expect(authenticated.runtimeStatus).toEqual({ status: "connected" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects OAuth flows for non-OAuth MCP servers", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

      await expect(service.authenticate(created.id)).rejects.toThrow(/not configured to use OAuth/);
      await expect(service.startAuth(created.id)).rejects.toThrow(/not configured to use OAuth/);
    } finally {
      await testDb.cleanup();
    }
  });

  it("translates upstream opencode failures into a BadRequestError", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    vi.mocked(opencodeService.authenticateMcp).mockRejectedValue(
      new Error("OpenCode request failed: POST /mcp/github/auth/authenticate \u2192 400: nope"),
    );
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

      await expect(service.authenticate(created.id)).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  describe("auth flows re-sync opencode.jsonc before calling opencode", () => {
    async function setupOauthServer() {
      const testDb = await createTestDatabase();
      const opencodeService = createMockOpenCodeService();
      const service = createMcpServerService({
        db: testDb.client.db,
        config: testDb.config,
        opencodeService,
        secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      });
      const configPath = join(testDb.config.paths.workspaceDir, "opencode.jsonc");

      const created = await service.create({
        name: "notion",
        enabled: true,
        config: {
          url: "https://notion.example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });

      return { testDb, service, opencodeService, configPath, created };
    }

    function readMcpEntry(text: string): unknown {
      return (JSON.parse(text) as { mcp: Record<string, unknown> }).mcp["notion"];
    }

    it("startAuth rewrites a corrupted opencode.jsonc before invoking opencode", async () => {
      const ctx = await setupOauthServer();
      try {
        await writeFile(ctx.configPath, '{ "mcp": {} }\n', "utf8");

        let snapshotAtCallTime: string | undefined;
        vi.mocked(ctx.opencodeService.startMcpAuth).mockImplementation(async () => {
          snapshotAtCallTime = await readFile(ctx.configPath, "utf8");
          return { authorizationUrl: "https://example.com/oauth" };
        });

        await ctx.service.startAuth(ctx.created.id);

        expect(snapshotAtCallTime).toBeDefined();
        expect(readMcpEntry(snapshotAtCallTime!)).toMatchObject({
          type: "remote",
          url: "https://notion.example.com/mcp",
          enabled: true,
        });
      } finally {
        await ctx.testDb.cleanup();
      }
    });

    it("authenticate rewrites a corrupted opencode.jsonc before invoking opencode", async () => {
      const ctx = await setupOauthServer();
      try {
        await writeFile(ctx.configPath, '{ "mcp": {} }\n', "utf8");

        let snapshotAtCallTime: string | undefined;
        vi.mocked(ctx.opencodeService.authenticateMcp).mockImplementation(async () => {
          snapshotAtCallTime = await readFile(ctx.configPath, "utf8");
          return { status: "connected" as const };
        });

        await ctx.service.authenticate(ctx.created.id);

        expect(snapshotAtCallTime).toBeDefined();
        expect(readMcpEntry(snapshotAtCallTime!)).toMatchObject({
          type: "remote",
          url: "https://notion.example.com/mcp",
        });
      } finally {
        await ctx.testDb.cleanup();
      }
    });

    it("completeAuth rewrites a corrupted opencode.jsonc before invoking opencode", async () => {
      const ctx = await setupOauthServer();
      try {
        await writeFile(ctx.configPath, '{ "mcp": {} }\n', "utf8");

        let snapshotAtCallTime: string | undefined;
        vi.mocked(ctx.opencodeService.completeMcpAuth).mockImplementation(async () => {
          snapshotAtCallTime = await readFile(ctx.configPath, "utf8");
          return { status: "connected" as const };
        });

        await ctx.service.completeAuth(ctx.created.id, "code");

        expect(snapshotAtCallTime).toBeDefined();
        expect(readMcpEntry(snapshotAtCallTime!)).toMatchObject({
          type: "remote",
          url: "https://notion.example.com/mcp",
        });
      } finally {
        await ctx.testDb.cleanup();
      }
    });

    it("removeAuth rewrites a corrupted opencode.jsonc before invoking opencode", async () => {
      const ctx = await setupOauthServer();
      try {
        await writeFile(ctx.configPath, '{ "mcp": {} }\n', "utf8");

        let snapshotAtCallTime: string | undefined;
        vi.mocked(ctx.opencodeService.removeMcpAuth).mockImplementation(async () => {
          snapshotAtCallTime = await readFile(ctx.configPath, "utf8");
          return { success: true as const };
        });

        await ctx.service.removeAuth(ctx.created.id);

        expect(snapshotAtCallTime).toBeDefined();
        expect(readMcpEntry(snapshotAtCallTime!)).toMatchObject({
          type: "remote",
          url: "https://notion.example.com/mcp",
        });
      } finally {
        await ctx.testDb.cleanup();
      }
    });
  });

  describe("disposeGlobal call sites", () => {
    it("calls disposeGlobal after update, setEnabled, startAuth, authenticate, completeAuth, and removeAuth", async () => {
      const testDb = await createTestDatabase();
      const opencodeService = createMockOpenCodeService();
      const service = createMcpServerService({
        db: testDb.client.db,
        config: testDb.config,
        opencodeService,
        secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

        vi.mocked(opencodeService.disposeGlobal).mockClear();

        await service.update(created.id, {
          name: "github",
          config: {
            url: "https://example.com/mcp/v2",
            transport: "streamable-http",
            authMethod: "oauth",
            headers: [],
          },
        });
        await service.setEnabled(created.id, false);
        await service.setEnabled(created.id, true);
        await service.startAuth(created.id);
        await service.authenticate(created.id);
        await service.completeAuth(created.id, "code");
        await service.removeAuth(created.id);

        expect(opencodeService.disposeGlobal).toHaveBeenCalledTimes(7);
      } finally {
        await testDb.cleanup();
      }
    });
  });
});

describe("mcp-server file persistence", () => {
  it("create writes configuration/mcp.json before inserting the DB row", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const created = await service.create({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "none",
          headers: [],
        },
      });

      const filePath = join(testDb.config.paths.subdirectories.configuration, "mcp.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        version: number;
        servers: Array<{ id: string; name: string; enabled: boolean }>;
      };

      expect(file.version).toBe(1);
      expect(file.servers).toHaveLength(1);
      expect(file.servers[0]).toMatchObject({ id: created.id, name: "github", enabled: true });
    } finally {
      await testDb.cleanup();
    }
  });

  it("remove deletes the entry from configuration/mcp.json", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const created = await service.create({
        name: "linear",
        enabled: true,
        config: {
          url: "https://linear.example.com/mcp",
          transport: "sse",
          authMethod: "none",
          headers: [],
        },
      });

      await service.remove(created.id);

      const filePath = join(testDb.config.paths.subdirectories.configuration, "mcp.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as { servers: unknown[] };
      expect(file.servers).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("setEnabled updates the enabled flag in configuration/mcp.json", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const created = await service.create({
        name: "notion",
        enabled: true,
        config: {
          url: "https://notion.example.com/mcp",
          transport: "sse",
          authMethod: "none",
          headers: [],
        },
      });

      await service.setEnabled(created.id, false);

      const filePath = join(testDb.config.paths.subdirectories.configuration, "mcp.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        servers: Array<{ id: string; enabled: boolean }>;
      };
      expect(file.servers[0]?.enabled).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("mcpServerReconciler", () => {
  it("restores DB rows from configuration/mcp.json and regenerates opencode.jsonc", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

      // Simulate fresh DB by clearing the table
      const { mcp_servers } = await import("../../src/db/schema/index.js");
      await testDb.client.db.delete(mcp_servers);

      expect(await service.list()).toHaveLength(0);

      const logger = { debug: () => {}, error: () => {} } as never;
      await mcpServerReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      expect(await service.list()).toHaveLength(1);

      // opencode.jsonc should be regenerated
      const rendered = JSON.parse(
        await readFile(join(testDb.config.paths.workspaceDir, "opencode.jsonc"), "utf8"),
      ) as { mcp: Record<string, unknown> };
      expect(rendered.mcp["github"]).toBeDefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes orphaned DB rows not present in configuration/mcp.json", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const created = await service.create({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "none",
          headers: [],
        },
      });

      // Remove from file but leave in DB (orphan)
      await service.remove(created.id);

      // Re-insert directly into DB to simulate orphan
      const { mcp_servers } = await import("../../src/db/schema/index.js");
      await testDb.client.db.insert(mcp_servers).values({
        id: created.id,
        name: "github",
        transport: "streamable-http",
        enabled: true,
        config_json: JSON.stringify({
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "none",
          headers: [],
        }),
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(await service.list()).toHaveLength(1);

      const logger = { debug: () => {}, error: () => {} } as never;
      await mcpServerReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      expect(await service.list()).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("raises NotFound for operations on an unknown server and Conflict on duplicate names", async () => {
    const testDb = await createTestDatabase();
    const service = createMcpServerService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    });

    try {
      const remoteConfig = {
        url: "https://example.com/mcp",
        transport: "streamable-http" as const,
        authMethod: "none" as const,
        headers: [],
      };

      await expect(
        service.update("missing", { name: "x", config: remoteConfig }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.setEnabled("missing", false)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.startAuth("missing")).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.authenticate("missing")).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.completeAuth("missing", "code")).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.removeAuth("missing")).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundError);

      await service.create({ name: "dup", enabled: true, config: remoteConfig });
      await expect(
        service.create({ name: "dup", enabled: true, config: remoteConfig }),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await testDb.cleanup();
    }
  });
});

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
    authenticateMcp: vi.fn(() => {
      authenticated = true;
      return Promise.resolve({ status: "connected" as const });
    }),
    removeMcpAuth: vi.fn(() => Promise.resolve({ success: true as const })),
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
  } as unknown as OpenCodeService;
}
