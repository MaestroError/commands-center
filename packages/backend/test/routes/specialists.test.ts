import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import type { WorkspaceWatchService } from "../../src/services/workspace-watch-service";
import { createTestDatabase } from "../helpers/db";

describe("agent routes", () => {
  it("supports create, list, get, update, catalog, and archive flows", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      workspaceWatchService: createWorkspaceWatchServiceMock(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: ["task-planner"],
            mcpServers: [{ name: "github", enabled: true, action: "allow" }],
            toolPermissions: [{ pattern: "custom_write", action: "ask" }],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json();

      const listed = await server.inject({
        method: "GET",
        url: "/api/specialists",
      });
      const fetched = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}`,
      });
      const fetchedBySlug = await server.inject({
        method: "GET",
        url: `/api/specialists/by-slug/${agent.slug}`,
      });
      const catalog = await server.inject({
        method: "GET",
        url: "/api/specialists/catalog",
      });
      const updated = await server.inject({
        method: "PATCH",
        url: `/api/specialists/${agent.id}`,
        payload: {
          name: "Writer Prime",
        },
      });
      const archived = await server.inject({
        method: "DELETE",
        url: `/api/specialists/${agent.id}`,
      });
      const withArchived = await server.inject({
        method: "GET",
        url: "/api/specialists?includeArchived=true",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().name).toBe("Writer");
      expect(fetchedBySlug.statusCode).toBe(200);
      expect(fetchedBySlug.json().id).toBe(agent.id);
      expect(catalog.statusCode).toBe(200);
      const catalogBody = catalog.json<{ builtInSkills: Array<{ slug: string }> }>();
      expect(catalogBody.builtInSkills.map((skill) => skill.slug)).toEqual([
        "concise-summarizer",
        "final-review",
        "global-skill-authoring",
        "global-tool-authoring",
        "self-skill-authoring",
        "self-tool-authoring",
        "task-planner",
      ]);
      expect(updated.statusCode).toBe(200);
      expect(updated.json().slug).toBe("writer-prime");
      expect(archived.statusCode).toBe(200);
      expect(archived.json().status).toBe("archived");
      expect(withArchived.statusCode).toBe(200);
      expect(withArchived.json()[0].status).toBe("archived");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows updating an agent without changing its name", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      workspaceWatchService: createWorkspaceWatchServiceMock(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      // Create agent
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Coder",
          role: "write code",
          instructions: "Write clean code.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      expect(created.statusCode).toBe(201);
      const agent = created.json();

      // Update only the model — same name should not trigger "slug taken"
      const updated = await server.inject({
        method: "PATCH",
        url: `/api/specialists/${agent.id}`,
        payload: {
          defaultModel: "anthropic/claude-sonnet-4-20250514",
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().defaultModel).toBe("anthropic/claude-sonnet-4-20250514");
      expect(updated.json().slug).toBe("coder");

      // Update with the same name explicitly — should also succeed
      const updatedWithName = await server.inject({
        method: "PATCH",
        url: `/api/specialists/${agent.id}`,
        payload: {
          name: "Coder",
          role: "write better code",
        },
      });
      expect(updatedWithName.statusCode).toBe(200);
      expect(updatedWithName.json().role).toBe("write better code");
      expect(updatedWithName.json().slug).toBe("coder");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects creating an agent with a duplicate name", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      workspaceWatchService: createWorkspaceWatchServiceMock(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      // Create first agent
      const first = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Reviewer",
          role: "review code",
          instructions: "Review thoroughly.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      expect(first.statusCode).toBe(201);

      // Try to create second agent with the same name
      const duplicate = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Reviewer",
          role: "another reviewer",
          instructions: "Also reviews.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.message).toContain("already in use");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("proxies agent-scoped workspace file endpoints with upstream-aligned shapes", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      workspaceWatchService: createWorkspaceWatchServiceMock(),
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Files Specialist",
          role: "inspect workspace",
          instructions: "Inspect files.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      const agent = created.json<{ id: string; workspacePath: string }>();
      await mkdir(join(agent.workspacePath, "src", "components"), { recursive: true });
      await writeFile(join(agent.workspacePath, "src", "index.ts"), "export {}\n", "utf8");

      const textSearch = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/workspace/find?pattern=TODO`,
      });
      const fileSearch = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/workspace/find/file?query=readme&type=file&limit=5`,
      });
      const fileList = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/workspace/file?path=src`,
      });
      const fileContent = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/workspace/file/content?path=README.md`,
      });
      const fileStatus = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/workspace/file/status`,
      });

      expect(textSearch.statusCode).toBe(200);
      expect(textSearch.json()).toEqual([
        {
          path: { text: "README.md" },
          lines: { text: "TODO: document file endpoints" },
          line_number: 3,
          absolute_offset: 42,
          submatches: [{ match: { text: "TODO" }, start: 0, end: 4 }],
        },
      ]);
      expect(opencodeService.findText).toHaveBeenCalledWith(agent.workspacePath, "TODO");

      expect(fileSearch.statusCode).toBe(200);
      expect(fileSearch.json()).toEqual(["README.md", "docs/README.md"]);
      expect(opencodeService.findFiles).toHaveBeenCalledWith(agent.workspacePath, {
        query: "readme",
        type: "file",
        limit: 5,
      });

      expect(fileList.statusCode).toBe(200);
      expect(fileList.json()).toEqual([
        {
          name: "components",
          path: "src/components",
          absolute: join(agent.workspacePath, "src", "components"),
          type: "directory",
          ignored: false,
          isCritical: false,
          criticalReason: undefined,
        },
        {
          name: "index.ts",
          path: "src/index.ts",
          absolute: join(agent.workspacePath, "src", "index.ts"),
          type: "file",
          ignored: false,
          isCritical: false,
          criticalReason: undefined,
        },
      ]);
      expect(opencodeService.listFiles).not.toHaveBeenCalled();

      expect(fileContent.statusCode).toBe(200);
      expect(fileContent.json()).toEqual({
        type: "text",
        content: "# Hello",
      });
      expect(opencodeService.readFile).toHaveBeenCalledWith(agent.workspacePath, "README.md");

      expect(fileStatus.statusCode).toBe(200);
      expect(fileStatus.json()).toEqual([
        {
          path: "README.md",
          added: 3,
          removed: 1,
          status: "modified",
        },
      ]);
      expect(opencodeService.getFileStatus).toHaveBeenCalledWith(agent.workspacePath);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
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
            models: {
              "openai/gpt-4.1": { name: "GPT-4.1" },
            },
          },
        ],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    ),
    listAuthMethods: vi.fn(() =>
      Promise.resolve({
        openai: [{ type: "api", label: "API key" }],
      }),
    ),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() =>
      Promise.resolve({
        url: "https://provider.example/oauth",
        method: "auto",
        instructions: "Finish login.",
      }),
    ),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
    createSession: vi.fn(),
    getSession: vi.fn(),
    listSessionMessages: vi.fn(),
    promptSession: vi.fn(),
    commandSession: vi.fn(),
    summarizeSession: vi.fn(),
    shellSession: vi.fn(),
    findText: vi.fn(() =>
      Promise.resolve([
        {
          path: { text: "README.md" },
          lines: { text: "TODO: document file endpoints" },
          line_number: 3,
          absolute_offset: 42,
          submatches: [{ match: { text: "TODO" }, start: 0, end: 4 }],
        },
      ]),
    ),
    findFiles: vi.fn(() => Promise.resolve(["README.md", "docs/README.md"])),
    listFiles: vi.fn(() =>
      Promise.resolve([
        {
          name: "components",
          path: "src/components",
          absolute: "/tmp/files-agent/src/components",
          type: "directory",
          ignored: false,
        },
        {
          name: "index.ts",
          path: "src/index.ts",
          absolute: "/tmp/files-agent/src/index.ts",
          type: "file",
          ignored: false,
        },
      ]),
    ),
    readFile: vi.fn(() => Promise.resolve({ type: "text", content: "# Hello" })),
    getFileStatus: vi.fn(() =>
      Promise.resolve([
        {
          path: "README.md",
          added: 3,
          removed: 1,
          status: "modified",
        },
      ]),
    ),
  } as unknown as OpenCodeService;
}

function createWorkspaceWatchServiceMock(): WorkspaceWatchService {
  return {
    subscribe: vi.fn(),
    dispose: vi.fn(),
  };
}
