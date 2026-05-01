import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("workspace skill routes", () => {
  it("creates workspace skills and exposes them in the agent catalog", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/workspace-skills",
        payload: {
          name: "Release Planning",
          description: "Plan release work.",
        },
      });
      expect(created.statusCode).toBe(201);

      const catalog = await server.inject({
        method: "GET",
        url: "/api/agents/catalog",
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json<{ workspaceSkills: Array<{ slug: string }> }>().workspaceSkills).toEqual([
        expect.objectContaining({ slug: "release-planning" }),
      ]);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("removes deleted workspace skills from assigned agents", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      await server.inject({
        method: "POST",
        url: "/api/workspace-skills",
        payload: {
          name: "Release Planning",
          description: "Plan release work.",
        },
      });

      const agentCreated = await server.inject({
        method: "POST",
        url: "/api/agents",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write release docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            workspaceSkills: ["release-planning"],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
      });
      const agent = agentCreated.json<{ id: string }>();

      const deleted = await server.inject({
        method: "DELETE",
        url: "/api/workspace-skills/release-planning",
      });
      expect(deleted.statusCode).toBe(204);

      const fetched = await server.inject({
        method: "GET",
        url: `/api/agents/${agent.id}`,
      });
      expect(fetched.statusCode).toBe(200);
      expect(
        fetched.json<{ capabilities: { workspaceSkills: string[] } }>().capabilities
          .workspaceSkills,
      ).toEqual([]);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns a readable validation error when uploaded skill folder and SKILL.md name differ", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/workspace-skills/upload",
        payload: {
          overwrite: false,
          entries: [
            {
              name: "SKILL.md",
              relativePath: "content-curator 2/SKILL.md",
              contentBase64: Buffer.from(
                [
                  "---",
                  "name: content-curator",
                  "description: Curate content.",
                  "compatibility: opencode",
                  "metadata:",
                  "  category: writing",
                  "---",
                  "",
                  "# content-curator",
                ].join("\n"),
                "utf8",
              ).toString("base64"),
              sizeBytes: 128,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json<{
        error: {
          message: string;
          details?: { renameSuggestedFrom?: string; renameSuggestedTo?: string };
        };
      }>();
      expect(payload.error.message).toContain("Rename the folder to 'content-curator'");
      expect(payload.error.details).toEqual({
        renameSuggestedFrom: "content-curator 2",
        renameSuggestedTo: "content-curator",
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("updates the category of a workspace skill", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      await server.inject({
        method: "POST",
        url: "/api/workspace-skills",
        payload: {
          name: "Release Planning",
          category: "planning",
          description: "Plan release work.",
        },
      });

      const response = await server.inject({
        method: "PATCH",
        url: "/api/workspace-skills/release-planning/category",
        payload: { category: "workflow" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ skill: { category: string } }>().skill.category).toBe("workflow");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createMockOpenCodeService(): OpenCodeService {
  return {
    ensureStarted: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ status: "ready", baseUrl: "http://127.0.0.1:4100" })),
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    findFiles: vi.fn(),
    findText: vi.fn(),
    readFile: vi.fn(),
    getFileStatus: vi.fn(),
    listProviders: vi.fn(() => Promise.resolve({ all: [], default: {}, connected: [] })),
    listAuthMethods: vi.fn(() => Promise.resolve([])),
    setApiKey: vi.fn(),
    startOauth: vi.fn(),
    completeOauth: vi.fn(),
    listMcpServers: vi.fn(() => Promise.resolve([])),
    refreshMcpServers: vi.fn(() => Promise.resolve([])),
    createMcpServer: vi.fn(),
    updateMcpServer: vi.fn(),
    deleteMcpServer: vi.fn(),
    setMcpServerEnabled: vi.fn(),
    startMcpAuth: vi.fn(),
    authenticateMcp: vi.fn(),
    removeMcpAuth: vi.fn(),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    promptSession: vi.fn(),
    abortSession: vi.fn(),
    startNewSession: vi.fn(),
    listSessionMedia: vi.fn(),
    createTerminal: vi.fn(),
    listTerminals: vi.fn(),
    getTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    deleteTerminal: vi.fn(),
    providerAuthStart: vi.fn(),
    providerAuthComplete: vi.fn(),
    providerAuthCancel: vi.fn(),
    providerListModels: vi.fn(() => Promise.resolve([])),
    providerListAuthMethods: vi.fn(() => Promise.resolve([])),
    providerListConnections: vi.fn(() => Promise.resolve([])),
    providerGetConfigProviders: vi.fn(() => Promise.resolve([])),
    providerConnectApiKey: vi.fn(),
    mcpRefresh: vi.fn(),
    mcpAddServer: vi.fn(),
    mcpUpdateServer: vi.fn(),
    mcpDeleteServer: vi.fn(),
    mcpGetAuthStatus: vi.fn(),
    mcpStartOauth: vi.fn(),
    mcpAuthenticateServer: vi.fn(),
    mcpDeleteAuth: vi.fn(),
    mcpReadConfig: vi.fn(() => Promise.resolve(null)),
    mcpWriteConfig: vi.fn(() => Promise.resolve()),
    sessionList: vi.fn(),
    sessionResolveCurrent: vi.fn(),
    sessionCreate: vi.fn(),
    sessionPrompt: vi.fn(),
    sessionAbort: vi.fn(),
    sessionSummarize: vi.fn(),
    sessionHistory: vi.fn(),
    createPty: vi.fn(),
    listPtys: vi.fn(),
    getPty: vi.fn(),
    killPty: vi.fn(),
    resizePty: vi.fn(),
  } as unknown as OpenCodeService;
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ status: "running", baseUrl: "http://127.0.0.1:4100" })),
  } as unknown as OpenCodeOrchestrator;
}
