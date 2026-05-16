import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import { createOwnerAccessService } from "../../src/services/owner-access-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42";
const NEXT_STRONG_PASSWORD = "CorrectHorseBatteryStaple43";

describe("owner auth routes", () => {
  it("reports unclaimed status without exposing auth internals", async () => {
    const testDb = await createTestDatabase();
    const server = await createAuthServer(testDb);

    try {
      const response = await server.inject({ method: "GET", url: "/api/auth/status" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "unclaimed" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("claims the workspace and authenticates the browser session", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      const claimCode = await ownerAccessService.rotateClaimCode();
      const claimed = await server.inject({
        method: "POST",
        url: "/api/auth/claim",
        payload: {
          claimCode: claimCode.code,
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
        },
      });
      const cookie = readSetCookie(claimed);
      const status = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie },
      });

      expect(claimed.statusCode).toBe(200);
      expect(claimed.json()).toEqual({ status: "claimed-authenticated" });
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");
      expect(status.json()).toEqual({ status: "claimed-authenticated" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects invalid claim codes with a typed error", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await ownerAccessService.rotateClaimCode();
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/claim",
        payload: {
          claimCode: "not-the-claim-code",
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "bad_request", message: "Claim code is invalid." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("does not accept the owner password as a bearer token", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const response = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { authorization: `Bearer ${STRONG_PASSWORD}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "claimed-unauthenticated" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("sets secure session cookies in production", async () => {
    const testDb = await createTestDatabase();
    const productionConfig = { ...testDb.config, nodeEnv: "production" as const };
    const ownerAccessService = createOwnerAccessService({ config: productionConfig });
    const server = await createAuthServer(
      { ...testDb, config: productionConfig },
      ownerAccessService,
    );

    try {
      const claimCode = await ownerAccessService.rotateClaimCode();
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/claim",
        payload: {
          claimCode: claimCode.code,
          password: STRONG_PASSWORD,
          confirmPassword: STRONG_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(readSetCookie(response)).toContain("Secure");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("logs in and logs out claimed workspaces", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const failed = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: "wrong-password" },
      });
      const loggedIn = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const cookie = readSetCookie(loggedIn);
      const loggedOut = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      const status = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie },
      });

      expect(failed.statusCode).toBe(401);
      expect(failed.json()).toEqual({
        error: { code: "unauthorized", message: "Invalid credentials." },
      });
      expect(loggedIn.statusCode).toBe(200);
      expect(loggedIn.json()).toEqual({ status: "claimed-authenticated" });
      expect(loggedOut.statusCode).toBe(200);
      expect(loggedOut.json()).toEqual({ status: "claimed-unauthenticated" });
      expect(readSetCookie(loggedOut)).toContain("Max-Age=0");
      expect(status.json()).toEqual({ status: "claimed-unauthenticated" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reclaims the workspace and revokes old sessions", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const loggedIn = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const oldCookie = readSetCookie(loggedIn);
      const reclaimCode = await ownerAccessService.rotateClaimCode();
      const reclaimed = await server.inject({
        method: "POST",
        url: "/api/auth/reclaim",
        payload: {
          claimCode: reclaimCode.code,
          password: NEXT_STRONG_PASSWORD,
          confirmPassword: NEXT_STRONG_PASSWORD,
        },
      });
      const newCookie = readSetCookie(reclaimed);
      const oldStatus = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie: oldCookie },
      });
      const newStatus = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie: newCookie },
      });

      expect(reclaimed.statusCode).toBe(200);
      expect(reclaimed.json()).toEqual({ status: "claimed-authenticated" });
      expect(oldStatus.json()).toEqual({ status: "claimed-unauthenticated" });
      expect(newStatus.json()).toEqual({ status: "claimed-authenticated" });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("changes the owner password and keeps the current session", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const currentLogin = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const otherLogin = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const currentCookie = readCookieHeader(currentLogin);
      const otherCookie = readCookieHeader(otherLogin);
      const csrf = readCsrfToken(currentCookie);
      const changed = await server.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: { cookie: currentCookie, "x-csrf-token": csrf },
        payload: {
          currentPassword: STRONG_PASSWORD,
          newPassword: NEXT_STRONG_PASSWORD,
          confirmNewPassword: NEXT_STRONG_PASSWORD,
        },
      });
      const currentStatus = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie: currentCookie },
      });
      const otherStatus = await server.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { cookie: otherCookie },
      });
      const newLogin = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: NEXT_STRONG_PASSWORD },
      });

      expect(changed.statusCode).toBe(200);
      expect(changed.json()).toEqual({ status: "changed", otherSessionsRevoked: true });
      expect(readSetCookie(changed)).toContain("cc_csrf_token=");
      expect(currentStatus.json()).toEqual({ status: "claimed-authenticated" });
      expect(otherStatus.json()).toEqual({ status: "claimed-unauthenticated" });
      expect(newLogin.statusCode).toBe(200);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects password changes with the wrong current password", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const login = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const cookie = readCookieHeader(login);
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: { cookie, "x-csrf-token": readCsrfToken(cookie) },
        payload: {
          currentPassword: "wrong-password",
          newPassword: NEXT_STRONG_PASSWORD,
          confirmNewPassword: NEXT_STRONG_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: "Invalid credentials." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects weak password changes with validation details", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await createAuthServer(testDb, ownerAccessService);

    try {
      await claimWorkspace(ownerAccessService);
      const login = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: STRONG_PASSWORD },
      });
      const cookie = readCookieHeader(login);
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: { cookie, "x-csrf-token": readCsrfToken(cookie) },
        payload: {
          currentPassword: STRONG_PASSWORD,
          newPassword: "password1234",
          confirmNewPassword: "password1234",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.issues).toContain("Password is too common.");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createAuthServer(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  ownerAccessService = createOwnerAccessService({ config: testDb.config }),
) {
  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
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

function readSetCookie(response: { headers: { [key: string]: unknown } }): string {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return typeof header[0] === "string" ? header[0] : "";
  }

  return typeof header === "string" ? header : "";
}

function readCookieHeader(response: { headers: { [key: string]: unknown } }): string {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header)
    ? header.filter((value): value is string => typeof value === "string")
    : typeof header === "string"
      ? [header]
      : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function readCsrfToken(cookieHeader: string): string {
  const match = /(?:^|; )cc_csrf_token=([^;]+)/.exec(cookieHeader);
  return match ? decodeURIComponent(match[1]!) : "";
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
