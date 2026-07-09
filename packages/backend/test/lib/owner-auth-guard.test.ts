import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import { CSRF_HEADER_NAME, createCsrfCookie, createCsrfToken } from "../../src/lib/csrf";
import { createLogger } from "../../src/lib/logger";
import { createOwnerSessionCookie } from "../../src/lib/owner-session-cookie";
import { PUBLIC_ROUTES, isPublicRoute } from "../../src/lib/public-routes";
import { loadRuntimeConfig, type RuntimeConfig } from "../../src/lib/runtime-config";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createOwnerAccessService } from "../../src/services/owner-access-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";
import { permissionsForPresets } from "../helpers/api-tokens";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42!";

describe("owner auth guard", () => {
  it("keeps the public route allowlist explicit", () => {
    expect(PUBLIC_ROUTES).toEqual([
      { method: "GET", path: "/api/health" },
      { method: "GET", path: "/api/auth/status" },
      { method: "GET", path: "/api/auth/csrf" },
      { method: "POST", path: "/api/auth/claim" },
      { method: "POST", path: "/api/auth/login" },
      { method: "POST", path: "/api/auth/logout" },
      { method: "POST", path: "/api/auth/reclaim" },
      { method: "GET", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
      { method: "POST", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
      { method: "DELETE", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
    ]);
    expect(isPublicRoute("GET", "/api/opencode")).toBe(false);
    expect(isPublicRoute("POST", "/api/mcp/cc/cc-app/specialists/writer")).toBe(true);
  });

  it("rejects protected API requests without an owner session", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const response = await server.inject({ method: "GET", url: "/api/opencode" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: "Owner session is required." },
      });
      expect(response.headers["content-type"]).toContain("application/json");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects public API requests without a bearer token even with an owner session", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const { cookie } = await createAuthenticatedCookie(testDb.config, ownerAccessService);
      const response = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: "Invalid or revoked API token." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows public API requests with a bearer token carrying the required scope", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const token = apiTokenService.createToken(
        "Template consumer",
        permissionsForPresets("templates"),
      );
      const response = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
        headers: { authorization: `Bearer ${token.token}` },
      });

      // The guard validates the bearer token and lets the request through to the
      // real public route (which lists triggerable templates — none exist here).
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ templates: [] });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects public API requests when the bearer token lacks the required scope", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const token = apiTokenService.createToken(
        "Template consumer",
        permissionsForPresets("templates"),
      );
      // The real `/api/public/v1/tasks` route requires the `tasks` scope; a
      // templates-only token is rejected by the guard before reaching it.
      const response = await server.inject({
        method: "GET",
        url: "/api/public/v1/tasks",
        headers: { authorization: `Bearer ${token.token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "forbidden", message: "Token is missing the required permission." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("requires CSRF for authenticated mutating API requests", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const { cookie } = await createAuthenticatedCookie(testDb.config, ownerAccessService);
      const response = await server.inject({
        method: "POST",
        url: "/api/terminal",
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "csrf_invalid", message: "CSRF token is invalid." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lets CC-managed MCP routes use their own bearer auth without owner session or origin", async () => {
    const testDb = await createTestDatabase();
    const productionConfig = loadRuntimeConfig({
      cwd: testDb.cwd,
      env: { NODE_ENV: "production", CC_PUBLIC_ORIGIN: "https://commands.example.com" },
    });
    const ownerAccessService = createOwnerAccessService({ config: productionConfig });
    const server = await createAuthServer(testDb, ownerAccessService, productionConfig);

    try {
      await claimWorkspace(ownerAccessService);
      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        headers: {
          authorization: "Bearer invalid",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.body).toContain("Invalid bearer token");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows authenticated mutating API requests with a valid CSRF token", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pty-123", backend: "opencode", cwd: "/tmp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { cookie, csrfToken } = await createAuthenticatedCookie(
        testDb.config,
        ownerAccessService,
      );
      const response = await server.inject({
        method: "POST",
        url: "/api/terminal",
        headers: { cookie, [CSRF_HEADER_NAME]: csrfToken },
        payload: {},
      });

      expect(response.statusCode).toBe(201);
    } finally {
      vi.unstubAllGlobals();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects mutating API requests from invalid origins", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const { cookie, csrfToken } = await createAuthenticatedCookie(
        testDb.config,
        ownerAccessService,
      );
      const response = await server.inject({
        method: "POST",
        url: "/api/terminal",
        headers: {
          cookie,
          [CSRF_HEADER_NAME]: csrfToken,
          origin: "https://evil.example",
        },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "forbidden", message: "Request origin is not allowed." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects production mutating API requests without origin or referer", async () => {
    const testDb = await createTestDatabase();
    const productionConfig = loadRuntimeConfig({
      cwd: testDb.cwd,
      env: { NODE_ENV: "production", CC_PUBLIC_ORIGIN: "https://commands.example.com" },
    });
    const ownerAccessService = createOwnerAccessService({ config: productionConfig });
    const server = await createAuthServer(testDb, ownerAccessService, productionConfig);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pty-123", backend: "opencode", cwd: "/tmp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { cookie, csrfToken } = await createAuthenticatedCookie(
        productionConfig,
        ownerAccessService,
      );
      const response = await server.inject({
        method: "POST",
        url: "/api/terminal",
        headers: { cookie, [CSRF_HEADER_NAME]: csrfToken },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "forbidden", message: "Request origin is not allowed." },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows production mutating API requests with an allowed referer", async () => {
    const testDb = await createTestDatabase();
    const productionConfig = loadRuntimeConfig({
      cwd: testDb.cwd,
      env: { NODE_ENV: "production", CC_PUBLIC_ORIGIN: "https://commands.example.com" },
    });
    const ownerAccessService = createOwnerAccessService({ config: productionConfig });
    const server = await createAuthServer(testDb, ownerAccessService, productionConfig);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pty-123", backend: "opencode", cwd: "/tmp" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { cookie, csrfToken } = await createAuthenticatedCookie(
        productionConfig,
        ownerAccessService,
      );
      const response = await server.inject({
        method: "POST",
        url: "/api/terminal",
        headers: {
          cookie,
          [CSRF_HEADER_NAME]: csrfToken,
          referer: "https://commands.example.com/profile",
        },
        payload: {},
      });

      expect(response.statusCode).toBe(201);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("redirects browser navigations based on owner auth state", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const unclaimed = await server.inject({
        method: "GET",
        url: "/workspace",
        headers: { accept: "text/html" },
      });
      await claimWorkspace(ownerAccessService);
      const unauthenticated = await server.inject({
        method: "GET",
        url: "/workspace",
        headers: { accept: "text/html" },
      });

      expect(unclaimed.statusCode).toBe(302);
      expect(unclaimed.headers.location).toBe("/claim");
      expect(unauthenticated.statusCode).toBe(302);
      expect(unauthenticated.headers.location).toBe("/login");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects unauthenticated SSE requests before opening streams", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const response = await server.inject({
        method: "GET",
        url: "/api/conversations/conv-1/events",
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["content-type"]).toContain("application/json");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects terminal WebSocket upgrades without an owner session", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      await server.listen({ host: "127.0.0.1", port: 0 });
      const address = server.server.address() as AddressInfo;

      await expect(
        openWebSocket(`ws://127.0.0.1:${address.port.toString()}/api/terminal/pty-123/connect`),
      ).rejects.toBeDefined();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createAuthServer(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  ownerAccessService = createOwnerAccessService({ config: testDb.config }),
  config: RuntimeConfig = testDb.config,
) {
  return createServer({
    config,
    logger: createLogger(config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config }),
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    ownerAccessService,
    scheduler: createSchedulerService(),
  });
}

async function claimWorkspace(
  ownerAccessService: ReturnType<typeof createOwnerAccessService>,
): Promise<void> {
  const claimCode = await ownerAccessService.rotateClaimCode();
  await ownerAccessService.claim({
    claimCode: claimCode.code,
    password: STRONG_PASSWORD,
    confirmPassword: STRONG_PASSWORD,
  });
}

async function createAuthenticatedCookie(
  config: Awaited<ReturnType<typeof createTestDatabase>>["config"],
  ownerAccessService: ReturnType<typeof createOwnerAccessService>,
): Promise<{ cookie: string; csrfToken: string }> {
  await claimWorkspace(ownerAccessService);
  const session = await ownerAccessService.login({ password: STRONG_PASSWORD });
  const csrfToken = createCsrfToken();
  const sessionCookie = createOwnerSessionCookie({ config, sessionId: session.sessionId });
  const csrfCookie = createCsrfCookie({ config, token: csrfToken });

  return {
    cookie: `${toCookiePair(sessionCookie)}; ${toCookiePair(csrfCookie)}`,
    csrfToken,
  };
}

function toCookiePair(setCookie: string): string {
  return setCookie.split(";")[0] ?? setCookie;
}

function openWebSocket(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on("open", () => {
      socket.close();
      resolve();
    });
    socket.on("error", reject);
  });
}

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
    dispose: vi.fn(),
    disposeGlobal: vi.fn(),
    listProviders: vi.fn().mockResolvedValue({ all: [], default: {}, connected: [] }),
    listAuthMethods: vi.fn(),
    setApiKey: vi.fn(),
    startOauth: vi.fn(),
    completeOauth: vi.fn(),
    disconnectProvider: vi.fn(),
  } as unknown as OpenCodeService;
}
