import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
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
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
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
            builtInSkills: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json<{ workspacePath: string; slug: string }>();

      await mkdir(join(testDb.config.paths.workspaceDir, "notes"), { recursive: true });
      await writeFile(join(testDb.config.paths.workspaceDir, "opencode.jsonc"), "{}", "utf8");
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
            name: "specialists",
            isCritical: true,
            absolutePath: testDb.config.paths.subdirectories.specialists,
          }),
          expect.objectContaining({
            name: "opencode.jsonc",
            isCritical: true,
            absolutePath: join(testDb.config.paths.workspaceDir, "opencode.jsonc"),
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

      const moved = await server.inject({
        method: "POST",
        url: "/api/file-manager/entries/move",
        payload: {
          root: "workspace",
          path: "notes/done.txt",
          destinationPath: ".",
        },
      });

      expect(moved.statusCode).toBe(200);
      expect(moved.json()).toEqual({ path: "done.txt" });

      const movedIntoCriticalDestination = await server.inject({
        method: "POST",
        url: "/api/file-manager/entries/move",
        payload: {
          root: "workspace",
          path: "done.txt",
          destinationPath: "specialists",
        },
      });

      expect(movedIntoCriticalDestination.statusCode).toBe(200);
      expect(movedIntoCriticalDestination.json()).toEqual({ path: "specialists/done.txt" });

      const movedBackFromCriticalDestination = await server.inject({
        method: "POST",
        url: "/api/file-manager/entries/move",
        payload: {
          root: "workspace",
          path: "specialists/done.txt",
          destinationPath: ".",
        },
      });

      expect(movedBackFromCriticalDestination.statusCode).toBe(200);
      expect(movedBackFromCriticalDestination.json()).toEqual({ path: "done.txt" });

      const deleted = await server.inject({
        method: "DELETE",
        url: `/api/file-manager/entries?root=workspace&path=${encodeURIComponent("done.txt")}`,
      });

      expect(deleted.statusCode).toBe(204);

      const allAgents = await server.inject({
        method: "GET",
        url: "/api/file-manager/nodes?root=all-specialists",
      });

      expect(allAgents.statusCode).toBe(200);
      expect(
        allAgents.json<{ nodes: Array<{ name: string; isCritical: boolean }> }>().nodes,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: agent.slug, isCritical: true })]),
      );

      const renameAgents = await server.inject({
        method: "PATCH",
        url: "/api/file-manager/entries",
        payload: {
          root: "workspace",
          path: "specialists",
          name: "agents-renamed",
        },
      });

      expect(renameAgents.statusCode).toBe(403);

      const deleteAgents = await server.inject({
        method: "DELETE",
        url: `/api/file-manager/entries?root=workspace&path=${encodeURIComponent("specialists")}`,
      });

      expect(deleteAgents.statusCode).toBe(403);

      const directorySearch = await server.inject({
        method: "GET",
        url: "/api/file-manager/directories?root=workspace&query=note&excludePath=notes&limit=50",
      });

      expect(directorySearch.statusCode).toBe(200);
      expect(directorySearch.json<{ directories: string[] }>().directories).toContain(".");
      expect(directorySearch.json<{ directories: string[] }>().directories).not.toContain("notes");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("searches workspace files by path and content through the global facade", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    vi.mocked(opencodeService.findFiles).mockResolvedValue(["src/index.ts", "docs/README.md"]);
    vi.mocked(opencodeService.findText).mockResolvedValue([
      {
        path: { text: "README.md" },
        lines: { text: "plan the release" },
        line_number: 7,
        absolute_offset: 0,
        submatches: [],
      },
    ]);

    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/search/files?query=plan",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        nameMatches: [{ path: "src/index.ts" }, { path: "docs/README.md" }],
        contentMatches: [{ path: "README.md", lineNumber: 7, lineText: "plan the release" }],
      });
      expect(opencodeService.findFiles).toHaveBeenCalledWith(testDb.config.paths.workspaceDir, {
        query: "plan",
        type: "file",
        limit: 20,
      });
      expect(opencodeService.findText).toHaveBeenCalledWith(
        testDb.config.paths.workspaceDir,
        "plan",
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
    findText: vi.fn(() => Promise.resolve([])),
    findFiles: vi.fn(() => Promise.resolve([])),
    listFiles: vi.fn(() => Promise.resolve([])),
    readFile: vi.fn(() => Promise.resolve({ type: "text", content: "" })),
    getFileStatus: vi.fn(() => Promise.resolve([])),
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

describe("file manager content routes", () => {
  async function bootServer() {
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
    return { testDb, server };
  }

  it("reads a workspace text file via GET /api/file-manager/files/content", async () => {
    const { testDb, server } = await bootServer();
    try {
      await mkdir(testDb.config.paths.workspaceDir, { recursive: true });
      await writeFile(join(testDb.config.paths.workspaceDir, "doc.md"), "# hi", "utf8");

      const response = await server.inject({
        method: "GET",
        url: `/api/file-manager/files/content?root=workspace&path=${encodeURIComponent("doc.md")}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        kind: string;
        content: string;
        revision: { sizeBytes: number };
      }>();
      expect(body.kind).toBe("text");
      expect(body.content).toBe("# hi");
      expect(body.revision.sizeBytes).toBe(4);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reads workspace file content without consulting host edit preferences", async () => {
    const { testDb, server } = await bootServer();
    try {
      await mkdir(testDb.config.paths.workspaceDir, { recursive: true });
      await mkdir(testDb.config.paths.subdirectories.preferences, { recursive: true });
      await writeFile(join(testDb.config.paths.workspaceDir, "doc.md"), "# hi", "utf8");
      await writeFile(
        resolve(testDb.config.paths.subdirectories.preferences, "file-manager.json"),
        "{ invalid json",
        "utf8",
      );

      const response = await server.inject({
        method: "GET",
        url: `/api/file-manager/files/content?root=workspace&path=${encodeURIComponent("doc.md")}`,
      });

      expect(response.statusCode).toBe(200);
      expect(
        response.json<{
          kind: string;
          content: string;
        }>(),
      ).toMatchObject({
        kind: "text",
        content: "# hi",
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("saves a file when the expectedRevision matches and 409s when it does not", async () => {
    const { testDb, server } = await bootServer();
    try {
      const filePath = join(testDb.config.paths.workspaceDir, "doc.md");
      await writeFile(filePath, "v1", "utf8");

      const read = await server.inject({
        method: "GET",
        url: `/api/file-manager/files/content?root=workspace&path=${encodeURIComponent("doc.md")}`,
      });
      const initial = read.json<{
        revision: { mtimeMs: number; sizeBytes: number; sha256: string };
      }>();

      const saved = await server.inject({
        method: "PUT",
        url: "/api/file-manager/files/content",
        payload: {
          root: "workspace",
          path: "doc.md",
          content: "v2",
          expectedRevision: initial.revision,
        },
      });

      expect(saved.statusCode).toBe(200);
      expect(await readFile(filePath, "utf8")).toBe("v2");

      const conflict = await server.inject({
        method: "PUT",
        url: "/api/file-manager/files/content",
        payload: {
          root: "workspace",
          path: "doc.md",
          content: "v3",
          expectedRevision: initial.revision,
        },
      });

      expect(conflict.statusCode).toBe(409);
      const conflictBody = conflict.json<{
        error: { code: string; details: { currentRevision: { sizeBytes: number } } };
      }>();
      expect(conflictBody.error.code).toBe("conflict");
      expect(conflictBody.error.details.currentRevision.sizeBytes).toBe(2);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects host-filesystem writes by default and allows them after preference toggle", async () => {
    const { testDb, server } = await bootServer();
    try {
      const filePath = join(testDb.config.paths.workspaceDir, "host-target.txt");
      await writeFile(filePath, "x", "utf8");

      const read = await server.inject({
        method: "GET",
        url: `/api/file-manager/files/content?root=host-filesystem&path=${encodeURIComponent(filePath)}`,
      });
      expect(read.statusCode).toBe(200);
      const initial = read.json<{
        revision: { mtimeMs: number; sizeBytes: number; sha256: string };
      }>();

      const blocked = await server.inject({
        method: "PUT",
        url: "/api/file-manager/files/content",
        payload: {
          root: "host-filesystem",
          path: filePath,
          content: "y",
          expectedRevision: initial.revision,
        },
      });
      expect(blocked.statusCode).toBe(403);

      const enabled = await server.inject({
        method: "PUT",
        url: "/api/file-manager/preferences",
        payload: { allowHostFilesystemEdits: true },
      });
      expect(enabled.statusCode).toBe(200);

      const allowed = await server.inject({
        method: "PUT",
        url: "/api/file-manager/files/content",
        payload: {
          root: "host-filesystem",
          path: filePath,
          content: "y",
          expectedRevision: initial.revision,
        },
      });
      expect(allowed.statusCode).toBe(200);
      expect(await readFile(filePath, "utf8")).toBe("y");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("marks host-filesystem file content writable after preference toggle", async () => {
    const { testDb, server } = await bootServer();
    try {
      const filePath = join(testDb.config.paths.workspaceDir, "host-readable.txt");
      await writeFile(filePath, "x", "utf8");
      const contentUrl = `/api/file-manager/files/content?root=host-filesystem&path=${encodeURIComponent(filePath)}`;

      const blockedRead = await server.inject({
        method: "GET",
        url: contentUrl,
      });
      expect(blockedRead.statusCode).toBe(200);
      expect(blockedRead.json<{ isWritable: boolean }>().isWritable).toBe(false);

      const enabled = await server.inject({
        method: "PUT",
        url: "/api/file-manager/preferences",
        payload: { allowHostFilesystemEdits: true },
      });
      expect(enabled.statusCode).toBe(200);

      const allowedRead = await server.inject({
        method: "GET",
        url: contentUrl,
      });
      expect(allowedRead.statusCode).toBe(200);
      expect(allowedRead.json<{ isWritable: boolean }>().isWritable).toBe(true);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns default preferences via GET /api/file-manager/preferences", async () => {
    const { testDb, server } = await bootServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/file-manager/preferences",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        allowHostFilesystemEdits: false,
        fileUploads: {
          maxUploadSizeBytes: 50 * 1024 * 1024,
          allowDangerousFiles: false,
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("uploads files into the current folder and rejects dangerous files by default", async () => {
    const { testDb, server } = await bootServer();
    try {
      await mkdir(join(testDb.config.paths.workspaceDir, "uploads"), { recursive: true });

      const response = await server.inject({
        method: "POST",
        url: "/api/file-manager/uploads",
        payload: {
          root: "workspace",
          destinationPath: "uploads",
          entries: [
            {
              name: "notes.txt",
              relativePath: "notes.txt",
              contentBase64: Buffer.from("hello", "utf8").toString("base64"),
              sizeBytes: 5,
            },
            {
              name: "script.sh",
              relativePath: "script.sh",
              contentBase64: Buffer.from("echo hi", "utf8").toString("base64"),
              sizeBytes: 7,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        uploaded: [{ name: "notes.txt", relativePath: "notes.txt", path: "uploads/notes.txt" }],
        rejected: [
          {
            name: "script.sh",
            relativePath: "script.sh",
            reason: "This file type is blocked by the current dangerous-file policy.",
          },
        ],
      });
      expect(
        await readFile(join(testDb.config.paths.workspaceDir, "uploads", "notes.txt"), "utf8"),
      ).toBe("hello");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("preserves folder relative paths and rejects overwriting protected files", async () => {
    const { testDb, server } = await bootServer();
    try {
      await mkdir(join(testDb.config.paths.subdirectories.specialists, "agent-a"), {
        recursive: true,
      });
      await writeFile(
        join(testDb.config.paths.subdirectories.specialists, "agent-a", "specialist.json"),
        "keep",
        "utf8",
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/file-manager/uploads",
        payload: {
          root: "all-specialists",
          destinationPath: "agent-a",
          entries: [
            {
              name: "todo.md",
              relativePath: "docs/todo.md",
              contentBase64: Buffer.from("next", "utf8").toString("base64"),
              sizeBytes: 4,
            },
            {
              name: "specialist.json",
              relativePath: "specialist.json",
              contentBase64: Buffer.from("replace", "utf8").toString("base64"),
              sizeBytes: 7,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(
        response.json<{ uploaded: Array<{ path: string }>; rejected: Array<{ reason: string }> }>(),
      ).toEqual({
        uploaded: [{ name: "todo.md", relativePath: "docs/todo.md", path: "agent-a/docs/todo.md" }],
        rejected: [
          {
            name: "specialist.json",
            relativePath: "specialist.json",
            reason: "This upload would overwrite a protected CommandsCenter-managed file.",
          },
        ],
      });
      expect(
        await readFile(
          join(testDb.config.paths.subdirectories.specialists, "agent-a", "docs", "todo.md"),
          "utf8",
        ),
      ).toBe("next");
      expect(
        await readFile(
          join(testDb.config.paths.subdirectories.specialists, "agent-a", "specialist.json"),
          "utf8",
        ),
      ).toBe("keep");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("treats AGENTS.md as editable (unprotected) while specialist.json stays protected", async () => {
    const { testDb, server } = await bootServer();
    try {
      const specialistDir = join(testDb.config.paths.subdirectories.specialists, "agent-b");
      await mkdir(specialistDir, { recursive: true });
      await writeFile(join(specialistDir, "AGENTS.md"), "rules", "utf8");
      await writeFile(join(specialistDir, "specialist.json"), "{}", "utf8");

      // AGENTS.md is no longer flagged critical; specialist.json is.
      const listing = await server.inject({
        method: "GET",
        url: "/api/file-manager/nodes?root=all-specialists&path=agent-b",
      });
      expect(listing.statusCode).toBe(200);
      expect(listing.json<{ nodes: Array<{ name: string; isCritical: boolean }> }>().nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "AGENTS.md", isCritical: false }),
          expect.objectContaining({ name: "specialist.json", isCritical: true }),
        ]),
      );

      // Renaming AGENTS.md is allowed.
      const renamed = await server.inject({
        method: "PATCH",
        url: "/api/file-manager/entries",
        payload: { root: "all-specialists", path: "agent-b/AGENTS.md", name: "AGENTS.renamed.md" },
      });
      expect(renamed.statusCode).toBe(200);

      // Deleting it is allowed too.
      const deleted = await server.inject({
        method: "DELETE",
        url: `/api/file-manager/entries?root=all-specialists&path=${encodeURIComponent("agent-b/AGENTS.renamed.md")}`,
      });
      expect(deleted.statusCode).toBe(204);

      // specialist.json remains protected against rename.
      const protectedRename = await server.inject({
        method: "PATCH",
        url: "/api/file-manager/entries",
        payload: { root: "all-specialists", path: "agent-b/specialist.json", name: "x.json" },
      });
      expect(protectedRename.statusCode).toBe(403);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});
