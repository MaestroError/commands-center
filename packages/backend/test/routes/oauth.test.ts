import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { CSRF_HEADER_NAME } from "../../src/lib/csrf";
import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createOwnerAccessService } from "../../src/services/owner-access-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { permissionsForPresets } from "../helpers/api-tokens";
import { createTestDatabase } from "../helpers/db";

const HOST = "localhost:3000";
const ORIGIN = `http://${HOST}`;
const RESOURCE = `${ORIGIN}/api/public/mcp`;
const STRONG_PASSWORD = "CorrectHorseBatteryStaple42!";

describe("OAuth routes", () => {
  it("serves path-specific protected-resource metadata", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/.well-known/oauth-protected-resource/api/public/mcp",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        resource: RESOURCE,
        authorization_servers: [`${ORIGIN}/oauth`],
        scopes_supported: ["mcp"],
        bearer_methods_supported: ["header"],
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("serves canonical authorization-server metadata", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server/oauth",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        issuer: `${ORIGIN}/oauth`,
        authorization_endpoint: `${ORIGIN}/oauth/authorize`,
        token_endpoint: `${ORIGIN}/oauth/token`,
        registration_endpoint: `${ORIGIN}/oauth/register`,
        revocation_endpoint: `${ORIGIN}/oauth/revoke`,
        scopes_supported: ["mcp"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns OAuth discovery details in an MCP authentication challenge", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/api/public/mcp",
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe(
        `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/public/mcp", scope="mcp"`,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("resolves an OAuth access token whose opaque value starts with the API-token prefix", async () => {
    const fixture = await createOAuthRouteServer();
    const apiToken = fixture.apiTokenService.createToken(
      "OAuth prefix collision",
      permissionsForPresets("tasks"),
    );
    vi.spyOn(fixture.server.mcpOAuthService, "resolveAccessToken").mockResolvedValue(
      apiToken.record,
    );

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/api/public/mcp",
        headers: { authorization: "Bearer cc_opaque-oauth-access-token" },
      });

      expect(response.statusCode).not.toBe(401);
    } finally {
      await fixture.cleanup();
    }
  });

  it("uses a valid direct API token without OAuth resolution", async () => {
    const fixture = await createOAuthRouteServer();
    const apiToken = fixture.apiTokenService.createToken(
      "Direct MCP token",
      permissionsForPresets("tasks"),
    );
    const resolveAccessToken = vi.spyOn(fixture.server.mcpOAuthService, "resolveAccessToken");

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/api/public/mcp",
        headers: { authorization: `Bearer ${apiToken.token}` },
      });

      expect(response.statusCode).not.toBe(401);
      expect(resolveAccessToken).not.toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });

  it("exposes safe interaction details for a valid authorization transaction", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const interaction = await startAuthorization(fixture);
      const response = await fixture.server.inject({
        method: "GET",
        url: `/api/oauth/interactions/${interaction.uid}`,
        headers: { cookie: interaction.cookie },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({
        uid: interaction.uid,
        client: { id: interaction.clientId, name: "MCP route test" },
        redirectUri: "http://127.0.0.1/callback",
        requestedResource: RESOURCE,
        scopes: ["mcp"],
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["x-frame-options"]).toBe("DENY");
    } finally {
      await fixture.cleanup();
    }
  });

  it("approves an authorization interaction with a valid CC API token", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const interaction = await startAuthorization(fixture);
      const apiToken = fixture.apiTokenService.createToken(
        "OAuth principal",
        permissionsForPresets("tasks"),
      );
      const response = await fixture.server.inject({
        method: "POST",
        url: `/api/oauth/interactions/${interaction.uid}`,
        headers: { cookie: interaction.cookie, origin: ORIGIN },
        payload: { decision: "approve", apiToken: apiToken.token },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({
        redirectTo: `${ORIGIN}/oauth/authorize/${interaction.uid}`,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("exchanges an approved authorization code for MCP-bound OAuth tokens", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const interaction = await startAuthorization(fixture);
      const apiToken = fixture.apiTokenService.createToken(
        "OAuth code principal",
        permissionsForPresets("tasks"),
      );
      const approval = await fixture.server.inject({
        method: "POST",
        url: `/api/oauth/interactions/${interaction.uid}`,
        headers: { cookie: interaction.cookie, origin: ORIGIN },
        payload: { decision: "approve", apiToken: apiToken.token },
      });
      const redirectTo = readRequiredString(approval.json(), "redirectTo");
      const resumeUrl = new URL(redirectTo);
      const resumed = await fixture.server.inject({
        method: "GET",
        url: `${resumeUrl.pathname}${resumeUrl.search}`,
        headers: { cookie: interaction.cookie, host: HOST },
      });
      const callback = new URL(readRequiredHeader(resumed.headers.location));
      const code = callback.searchParams.get("code");

      if (!code) {
        throw new Error(`Authorization did not return a code: ${resumed.body}`);
      }

      const exchanged = await fixture.server.inject({
        method: "POST",
        url: "/oauth/token",
        headers: { "content-type": "application/x-www-form-urlencoded", host: HOST },
        payload: new URLSearchParams({
          client_id: interaction.clientId,
          code,
          code_verifier: interaction.verifier,
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1/callback",
          resource: RESOURCE,
        }).toString(),
      });
      const accessToken = readRequiredString(exchanged.json(), "access_token");

      expect(exchanged.statusCode, exchanged.body).toBe(200);
      expect(readRequiredString(exchanged.json(), "token_type")).toBe("Bearer");
      expect(readRequiredString(exchanged.json(), "refresh_token")).not.toBe("");
      expect((await fixture.server.mcpOAuthService.resolveAccessToken(accessToken))?.id).toBe(
        apiToken.record.id,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("denies an authorization interaction without requiring an API token", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const interaction = await startAuthorization(fixture);
      const response = await fixture.server.inject({
        method: "POST",
        url: `/api/oauth/interactions/${interaction.uid}`,
        headers: { cookie: interaction.cookie, origin: ORIGIN },
        payload: { decision: "deny" },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(readRequiredString(response.json(), "redirectTo")).toBe(
        `${ORIGIN}/oauth/authorize/${interaction.uid}`,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an invalid API token without echoing it", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const interaction = await startAuthorization(fixture);
      const invalidToken = "cc_invalid-secret-value";
      const response = await fixture.server.inject({
        method: "POST",
        url: `/api/oauth/interactions/${interaction.uid}`,
        headers: { cookie: interaction.cookie, origin: ORIGIN },
        payload: { decision: "approve", apiToken: invalidToken },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: "Invalid API token." },
      });
      expect(response.body).not.toContain(invalidToken);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an OAuth access token on public REST routes", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const principal = await createOAuthPrincipal(fixture);
      const response = await fixture.server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
        headers: { authorization: `Bearer ${principal.accessToken}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("immediately rejects an OAuth access token after its backing API token is revoked", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const principal = await createOAuthPrincipal(fixture);
      const accepted = await fixture.server.inject({
        method: "GET",
        url: "/api/public/mcp",
        headers: { authorization: `Bearer ${principal.accessToken}` },
      });
      fixture.apiTokenService.revokeToken(principal.apiTokenId);
      const revoked = await fixture.server.inject({
        method: "GET",
        url: "/api/public/mcp",
        headers: { authorization: `Bearer ${principal.accessToken}` },
      });

      expect(accepted.statusCode).not.toBe(401);
      expect(revoked.statusCode).toBe(401);
      expect(revoked.headers["www-authenticate"]).toContain("resource_metadata=");
    } finally {
      await fixture.cleanup();
    }
  });

  it("requires an owner session to reset OAuth runtime state", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({ method: "DELETE", url: "/api/oauth/runtime" });

      expect(response.statusCode).toBe(401);
    } finally {
      await fixture.cleanup();
    }
  });

  it("resets OAuth records without revoking the backing API token", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const principal = await createOAuthPrincipal(fixture);
      const ownerAuth = await createOwnerAuth(fixture);
      const response = await fixture.server.inject({
        method: "DELETE",
        url: "/api/oauth/runtime",
        headers: {
          cookie: ownerAuth.cookie,
          [CSRF_HEADER_NAME]: ownerAuth.csrfToken,
          origin: ORIGIN,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(
        await fixture.server.mcpOAuthService.resolveAccessToken(principal.accessToken),
      ).toBeNull();
      expect(fixture.apiTokenService.resolveActiveTokenById(principal.apiTokenId)).not.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("clears an exhausted registration quota when resetting OAuth runtime state", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      for (let index = 0; index < 10; index += 1) {
        const registration = await registerOAuthClient(fixture, `before-reset-${index.toString()}`);
        expect(registration.statusCode, registration.body).toBe(201);
      }

      const limited = await registerOAuthClient(fixture, "limited");
      expect(limited.statusCode).toBe(429);

      const ownerAuth = await createOwnerAuth(fixture);
      const reset = await fixture.server.inject({
        method: "DELETE",
        url: "/api/oauth/runtime",
        headers: {
          cookie: ownerAuth.cookie,
          [CSRF_HEADER_NAME]: ownerAuth.csrfToken,
          origin: ORIGIN,
        },
      });
      expect(reset.statusCode).toBe(200);

      const registration = await registerOAuthClient(fixture, "after-reset");
      expect(registration.statusCode, registration.body).toBe(201);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps adjacent OAuth API paths behind owner authentication", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/api/oauth/interactions-extra/not-public",
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps adjacent OAuth browser paths behind owner navigation authentication", async () => {
    const fixture = await createOAuthRouteServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/oauth/register/adjacent",
        headers: { accept: "text/html" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("/claim");
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createOAuthRouteServer() {
  const testDb = await createTestDatabase();
  const config = {
    ...testDb.config,
    security: { ...testDb.config.security, publicOrigin: ORIGIN },
  };
  const apiTokenService = createApiTokenService({ db: testDb.client.db });
  const ownerAccessService = createOwnerAccessService({ config });
  const server = createServer({
    config,
    logger: createLogger(config),
    database: testDb.client,
    apiTokenService,
    ownerAccessService,
    orchestrator: createOrchestrator(),
    opencodeService: createOpenCodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config }),
    scheduler: createSchedulerService(),
  });

  return {
    apiTokenService,
    ownerAccessService,
    server,
    async cleanup() {
      await server.close();
      await testDb.cleanup();
    },
  };
}

function registerOAuthClient(
  fixture: Awaited<ReturnType<typeof createOAuthRouteServer>>,
  suffix: string,
) {
  return fixture.server.inject({
    method: "POST",
    url: "/oauth/register",
    headers: { host: HOST },
    payload: {
      client_name: `MCP route test ${suffix}`,
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [`http://127.0.0.1/callback/${suffix}`],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
}

async function startAuthorization(fixture: Awaited<ReturnType<typeof createOAuthRouteServer>>) {
  const registration = await fixture.server.inject({
    method: "POST",
    url: "/oauth/register",
    headers: { host: HOST },
    payload: {
      client_name: "MCP route test",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://127.0.0.1/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  const clientId = readRequiredString(registration.json(), "client_id");
  const verifier = "route-test-code-verifier-value-12345678901234567890";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = await fixture.server.inject({
    method: "GET",
    url: `/oauth/authorize?${new URLSearchParams({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: "http://127.0.0.1/callback",
      resource: RESOURCE,
      response_type: "code",
      scope: "mcp",
      state: "route-test-state",
    }).toString()}`,
    headers: { host: HOST },
  });
  const location = readRequiredHeader(authorization.headers.location);
  const uid = /^\/oauth-interaction\/([A-Za-z0-9_-]+)$/.exec(location)?.[1];

  if (!uid) {
    throw new Error(`Authorization did not start an interaction: ${authorization.body}`);
  }

  return {
    clientId,
    cookie: readCookieHeader(authorization),
    uid,
    verifier,
  };
}

async function createOAuthPrincipal(fixture: Awaited<ReturnType<typeof createOAuthRouteServer>>) {
  const registration = await fixture.server.inject({
    method: "POST",
    url: "/oauth/register",
    headers: { host: HOST },
    payload: {
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://127.0.0.1/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  const clientId = readRequiredString(registration.json(), "client_id");
  const client = await fixture.server.oauthProvider.Client.find(clientId);

  if (!client) {
    throw new Error("OAuth test client was not persisted.");
  }

  const apiToken = fixture.apiTokenService.createToken(
    "OAuth route principal",
    permissionsForPresets("tasks"),
  );
  const grant = new fixture.server.oauthProvider.Grant({
    accountId: apiToken.record.id,
    clientId,
  });
  grant.addResourceScope(RESOURCE, "mcp");
  const grantId = await grant.save();
  const accessToken = await new fixture.server.oauthProvider.AccessToken({
    accountId: apiToken.record.id,
    aud: RESOURCE,
    client,
    expiresWithSession: false,
    grantId,
    gty: "authorization_code",
    resource: RESOURCE,
    scope: "mcp",
  }).save();

  return { accessToken, apiTokenId: apiToken.record.id };
}

async function createOwnerAuth(fixture: Awaited<ReturnType<typeof createOAuthRouteServer>>) {
  const claimCode = await fixture.ownerAccessService.rotateClaimCode();
  await fixture.ownerAccessService.claim({
    claimCode: claimCode.code,
    password: STRONG_PASSWORD,
    confirmPassword: STRONG_PASSWORD,
  });
  const login = await fixture.server.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password: STRONG_PASSWORD },
  });
  const cookie = readCookieHeader(login);
  const csrfToken = /(?:^|; )cc_csrf_token=([^;]+)/.exec(cookie)?.[1];

  if (!csrfToken) {
    throw new Error("Owner login did not create a CSRF token.");
  }

  return { cookie, csrfToken: decodeURIComponent(csrfToken) };
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

function readRequiredString(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`OAuth response is missing ${key}.`);
  }

  const result = (value as Record<string, unknown>)[key];

  if (typeof result !== "string") {
    throw new Error(`OAuth response contains an invalid ${key}.`);
  }

  return result;
}

function readRequiredHeader(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("OAuth response is missing a Location header.");
  }

  return value;
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

function createOpenCodeService(): OpenCodeService {
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
