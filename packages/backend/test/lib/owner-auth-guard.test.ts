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
import { createOwnerAccessService } from "../../src/services/owner-access-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42!";

describe("owner auth guard", () => {
  it("keeps the public route allowlist explicit", () => {
    expect(PUBLIC_ROUTES).toEqual([
      { method: "GET", path: "/api/health" },
      { method: "GET", path: "/api/auth/status" },
      { method: "POST", path: "/api/auth/claim" },
      { method: "POST", path: "/api/auth/login" },
      { method: "POST", path: "/api/auth/logout" },
      { method: "POST", path: "/api/auth/reclaim" },
    ]);
    expect(isPublicRoute("GET", "/api/opencode")).toBe(false);
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
        error: { code: "forbidden", message: "CSRF token is invalid." },
      });
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
