import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

function createMockOrchestrator(): OpenCodeOrchestrator {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    refreshHealth: vi.fn().mockResolvedValue(true),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(),
    disposeGlobal: vi.fn(),
    listProviders: vi.fn().mockResolvedValue({ all: [], default: "", connected: [] }),
    listAuthMethods: vi.fn(),
    setApiKey: vi.fn(),
    startOauth: vi.fn(),
    completeOauth: vi.fn(),
    disconnectProvider: vi.fn(),
    listMcpStatus: vi.fn().mockResolvedValue({}),
    listMcpToolIds: vi.fn().mockResolvedValue([]),
    startMcpAuth: vi.fn(),
    completeMcpAuth: vi.fn(),
    authenticateMcp: vi.fn(),
    removeMcpAuth: vi.fn(),
    createSession: vi.fn().mockResolvedValue({ id: "sess-1", time: { created: Date.now() } }),
    getSession: vi.fn(),
    listSessionStatuses: vi.fn().mockResolvedValue({}),
    getSessionStatus: vi.fn().mockResolvedValue({ type: "idle" }),
    listSessionMessages: vi.fn().mockResolvedValue([]),
    promptSession: vi.fn(),
    commandSession: vi.fn(),
    summarizeSession: vi.fn(),
    shellSession: vi.fn(),
    promptSessionAsync: vi.fn(),
    replyPermission: vi.fn(),
    listPendingPermissions: vi.fn().mockResolvedValue([]),
    replyQuestion: vi.fn(),
    listPendingQuestions: vi.fn().mockResolvedValue([]),
    rejectQuestion: vi.fn(),
    abortSession: vi.fn(),
    deleteSession: vi.fn(),
    findText: vi.fn().mockResolvedValue([]),
    findFiles: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn(),
    getFileStatus: vi.fn().mockResolvedValue([]),
  };
}

function jsonResponse(status = 200, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

describe("terminal routes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a terminal session", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValue(jsonResponse(201, mockSession));

      const created = await server.inject({
        method: "POST",
        url: "/api/terminal",
        payload: {},
      });

      expect(created.statusCode).toBe(201);
      const session = created.json();
      expect(session.id).toBeDefined();
      expect(session.backend).toBe("opencode");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists terminal sessions sorted by newest first", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });
    const nowSpy = vi.spyOn(Date, "now");

    try {
      nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(200);
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          { id: "pty-older", backend: "opencode", cwd: "/a" },
          { id: "pty-newer", backend: "opencode", cwd: "/b" },
        ]),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/terminal",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ sessions: Array<{ id: string }> }>();
      expect(body.sessions.map((session) => session.id).sort()).toEqual(["pty-newer", "pty-older"]);
    } finally {
      nowSpy.mockRestore();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns a session when fetching by id", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            id: "pty-123",
            backend: "opencode",
            cwd: "/home/user",
            createdAt: Date.now(),
          },
        ]),
      );

      const response = await server.inject({
        method: "GET",
        url: "/api/terminal/pty-123",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: "pty-123", backend: "opencode" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 for non-existent session", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      fetchMock.mockResolvedValue(jsonResponse(200, []));

      const response = await server.inject({
        method: "GET",
        url: "/api/terminal/non-existent",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("validates resize input bounds", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValue(jsonResponse(201, mockSession));

      const created = await server.inject({
        method: "POST",
        url: "/api/terminal",
        payload: {},
      });
      const session = created.json();

      const invalidResize = await server.inject({
        method: "POST",
        url: `/api/terminal/${session.id}/resize`,
        payload: { cols: 0, rows: 24 },
      });
      expect(invalidResize.statusCode).toBe(400);

      const outOfBoundsResize = await server.inject({
        method: "POST",
        url: `/api/terminal/${session.id}/resize`,
        payload: { cols: 300, rows: 24 },
      });
      expect(outOfBoundsResize.statusCode).toBe(400);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 204 for a valid resize request", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, [
            {
              id: "pty-123",
              backend: "opencode",
              cwd: "/home/user",
              createdAt: Date.now(),
            },
          ]),
        )
        .mockResolvedValueOnce(jsonResponse(200, true));

      const response = await server.inject({
        method: "POST",
        url: "/api/terminal/pty-123/resize",
        payload: { cols: 80, rows: 24 },
      });

      expect(response.statusCode).toBe(204);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.any(URL),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ size: { cols: 80, rows: 24 } }),
        }),
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 204 when closing a session", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createMockOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock
        .mockResolvedValueOnce(jsonResponse(201, mockSession))
        .mockResolvedValueOnce(jsonResponse(200, [mockSession]))
        .mockResolvedValueOnce(jsonResponse(200, []))
        .mockResolvedValueOnce(jsonResponse(200, true));

      const created = await server.inject({
        method: "POST",
        url: "/api/terminal",
        payload: {},
      });

      const closed = await server.inject({
        method: "DELETE",
        url: `/api/terminal/${created.json().id}`,
      });

      expect(closed.statusCode).toBe(204);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});
