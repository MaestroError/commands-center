import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("custom tool routes", () => {
  it("supports create, copy to agents, inspect agent tools, and move back to global", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const toolCreated = await server.inject({
        method: "POST",
        url: "/api/custom-tools",
        payload: {
          name: "Release Helper",
          description: "Draft release notes.",
        },
      });
      expect(toolCreated.statusCode).toBe(201);
      const tool = toolCreated.json<{ tool: { slug: string } }>().tool;

      const agentCreated = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write release docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      expect(agentCreated.statusCode).toBe(201);
      const agent = agentCreated.json<{ id: string; slug: string }>();

      const copied = await server.inject({
        method: "POST",
        url: `/api/custom-tools/${tool.slug}/copy-to-specialists`,
        payload: {
          agentIds: [agent.id],
          overwrite: false,
        },
      });
      expect(copied.statusCode).toBe(200);
      expect(copied.json<{ copied: Array<{ agentId: string }> }>().copied[0]?.agentId).toBe(
        agent.id,
      );

      const listedAgentTools = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/custom-tools`,
      });
      expect(listedAgentTools.statusCode).toBe(200);
      expect(listedAgentTools.json<Array<{ slug: string; status: string }>>()).toEqual([
        expect.objectContaining({ slug: tool.slug, status: "matching" }),
      ]);

      const moved = await server.inject({
        method: "POST",
        url: `/api/specialists/${agent.id}/custom-tools/${tool.slug}/move-to-global`,
        payload: {
          overwrite: true,
        },
      });
      expect(moved.statusCode).toBe(200);

      const globalTools = await server.inject({
        method: "GET",
        url: "/api/custom-tools",
      });
      expect(globalTools.statusCode).toBe(200);
      expect(globalTools.json<Array<{ slug: string }>>().map((entry) => entry.slug)).toContain(
        tool.slug,
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("supports rename on copy and removing agent-local tools", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const toolCreated = await server.inject({
        method: "POST",
        url: "/api/custom-tools",
        payload: {
          name: "Release Helper",
          description: "Draft release notes.",
        },
      });
      const tool = toolCreated.json<{ tool: { slug: string } }>().tool;

      const agentCreated = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write release docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      const agent = agentCreated.json<{ id: string }>();

      const copied = await server.inject({
        method: "POST",
        url: `/api/custom-tools/${tool.slug}/copy-to-specialists`,
        payload: {
          agentIds: [agent.id],
          destinationName: "Release Helper Copy",
          overwrite: false,
        },
      });
      expect(copied.statusCode).toBe(200);

      const listedAgentTools = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/custom-tools`,
      });
      expect(listedAgentTools.json<Array<{ slug: string }>>().map((entry) => entry.slug)).toContain(
        "release-helper-copy",
      );

      const removed = await server.inject({
        method: "DELETE",
        url: `/api/specialists/${agent.id}/custom-tools/release-helper-copy`,
      });
      expect(removed.statusCode).toBe(204);
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
