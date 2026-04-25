import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("file manager routes", () => {
  it("lists workspace files with absolute metadata and supports CRUD", async () => {
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
        url: "/api/agents",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json<{ workspacePath: string; slug: string }>();

      await mkdir(join(testDb.config.paths.workspaceDir, "notes"), { recursive: true });
      await writeFile(join(testDb.config.paths.workspaceDir, "notes", "draft.md"), "hello", "utf8");

      const listed = await server.inject({
        method: "GET",
        url: "/api/file-manager/nodes?root=workspace",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        root: "workspace",
        currentPath: ".",
        absolutePath: testDb.config.paths.workspaceDir,
      });
      expect(
        listed.json<{
          nodes: Array<{
            name: string;
            isCritical: boolean;
            absolutePath: string;
            sizeBytes?: number;
          }>;
        }>().nodes,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "agents",
            isCritical: false,
            absolutePath: testDb.config.paths.subdirectories.agents,
          }),
          expect.objectContaining({
            name: "database",
            isCritical: true,
            absolutePath: testDb.config.paths.subdirectories.database,
          }),
        ]),
      );

      const createdFile = await server.inject({
        method: "POST",
        url: "/api/file-manager/entries",
        payload: {
          root: "workspace",
          parentPath: "notes",
          name: "todo.txt",
          type: "file",
        },
      });

      expect(createdFile.statusCode).toBe(201);
      expect(
        await readFile(join(testDb.config.paths.workspaceDir, "notes", "todo.txt"), "utf8"),
      ).toBe("");

      const renamed = await server.inject({
        method: "PATCH",
        url: "/api/file-manager/entries",
        payload: {
          root: "workspace",
          path: "notes/todo.txt",
          name: "done.txt",
        },
      });

      expect(renamed.statusCode).toBe(200);
      expect(renamed.json()).toEqual({ path: "notes/done.txt" });

      const deleted = await server.inject({
        method: "DELETE",
        url: `/api/file-manager/entries?root=workspace&path=${encodeURIComponent("notes/done.txt")}`,
      });

      expect(deleted.statusCode).toBe(204);

      const allAgents = await server.inject({
        method: "GET",
        url: "/api/file-manager/nodes?root=all-agents",
      });

      expect(allAgents.statusCode).toBe(200);
      expect(
        allAgents.json<{ nodes: Array<{ name: string; isCritical: boolean }> }>().nodes,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: agent.slug, isCritical: true })]),
      );
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
        all: [],
        default: {},
        connected: [],
      }),
    ),
    listAuthMethods: vi.fn(() => Promise.resolve({})),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() => Promise.resolve({ url: "", method: "auto", instructions: "" })),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
    listMcpStatus: vi.fn(() => Promise.resolve({})),
    listMcpTools: vi.fn(() => Promise.resolve({})),
    listMcpToolIds: vi.fn(() => Promise.resolve([])),
    startMcpAuth: vi.fn(() => Promise.resolve({ authorizationUrl: "", oauthState: "" })),
    authenticateMcp: vi.fn(() => Promise.resolve({ status: "connected" })),
    completeMcpAuth: vi.fn(() => Promise.resolve({ status: "connected" })),
    removeMcpAuth: vi.fn(() => Promise.resolve({ removed: true })),
    searchWorkspaceFiles: vi.fn(() => Promise.resolve([])),
    listWorkspaceTree: vi.fn(() => Promise.resolve([])),
    getSessionMessages: vi.fn(() => Promise.resolve([])),
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendPrompt: vi.fn(),
    sendCommand: vi.fn(),
    sendShell: vi.fn(),
    replyToQuestion: vi.fn(),
    replyToPermission: vi.fn(),
    abortSession: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as OpenCodeService;
}
