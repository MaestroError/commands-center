import { describe, expect, it } from "vitest";

import {
  createLogger,
  createSchedulerService,
  createServer,
  type EngineStatus,
  type OpenCodeOrchestrator,
  type OpenCodeService,
} from "@cc/backend";

import { createApiTokenService } from "../../src/services/api-token-service";
import { permissionsForPresets } from "../helpers/api-tokens";
import { createTestDatabase } from "../helpers/db";

describe("OAuth provider", () => {
  it("serves restricted authorization-server discovery", async () => {
    const fixture = await createProviderServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server/oauth",
        headers: { host: "localhost:3000" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        issuer: "http://localhost:3000/oauth",
        authorization_endpoint: "http://localhost:3000/oauth/authorize",
        token_endpoint: "http://localhost:3000/oauth/token",
        registration_endpoint: "http://localhost:3000/oauth/register",
        revocation_endpoint: "http://localhost:3000/oauth/revoke",
        grant_types_supported: ["authorization_code", "refresh_token"],
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
      expect(response.json()).not.toHaveProperty("device_authorization_endpoint");
      expect(response.json()).not.toHaveProperty("introspection_endpoint");
    } finally {
      await fixture.cleanup();
    }
  });

  it("dynamically registers a public client without a secret", async () => {
    const fixture = await createProviderServer();

    try {
      const response = await fixture.server.inject({
        method: "POST",
        url: "/oauth/register",
        headers: { host: "localhost:3000" },
        payload: {
          client_name: "MCP test client",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["http://127.0.0.1/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({
        client_name: "MCP test client",
        token_endpoint_auth_method: "none",
      });
      expect(response.json()).toHaveProperty("client_id");
      expect(response.json()).not.toHaveProperty("client_secret");
      expect(response.json()).not.toHaveProperty("registration_access_token");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects confidential dynamic client registration", async () => {
    const fixture = await createProviderServer();

    try {
      const response = await fixture.server.inject({
        method: "POST",
        url: "/oauth/register",
        headers: { host: "localhost:3000" },
        payload: {
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://client.example/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_basic",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid_client_metadata" });
    } finally {
      await fixture.cleanup();
    }
  });

  it("rate-limits dynamic client registration per observed source", async () => {
    const fixture = await createProviderServer();

    try {
      const responses = await Array.from({ length: 11 }, (_, index) => index).reduce(
        (previous, index) =>
          previous.then(async (current) => {
            const response = await fixture.server.inject({
              method: "POST",
              url: "/oauth/register",
              headers: { host: "localhost:3000" },
              payload: {
                client_name: `MCP client ${index.toString()}`,
                grant_types: ["authorization_code", "refresh_token"],
                redirect_uris: [`http://127.0.0.1/callback/${index.toString()}`],
                response_types: ["code"],
                token_endpoint_auth_method: "none",
              },
            });

            return [...current, response];
          }),
        Promise.resolve([] as Awaited<ReturnType<typeof fixture.server.inject>>[]),
      );
      const rateLimited = responses.find((response) => response.statusCode === 429);

      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(10);
      expect(rateLimited?.body).not.toContain("callback/");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects OAuth requests sent to an unconfigured host", async () => {
    const fixture = await createProviderServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/oauth/jwks",
        headers: { host: "attacker.example" },
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects unconfigured forwarded hosts when proxy headers are trusted", async () => {
    const fixture = await createProviderServer(true);

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/oauth/jwks",
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "http",
        },
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects refresh after the backing API token is revoked", async () => {
    const fixture = await createProviderServer();

    try {
      const registration = await fixture.server.inject({
        method: "POST",
        url: "/oauth/register",
        headers: { host: "localhost:3000" },
        payload: {
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["http://127.0.0.1/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      const registrationBody: unknown = registration.json();

      if (
        typeof registrationBody !== "object" ||
        registrationBody === null ||
        !("client_id" in registrationBody) ||
        typeof registrationBody.client_id !== "string"
      ) {
        throw new Error("OAuth registration did not return a client id.");
      }

      const clientId = registrationBody.client_id;
      const client = await fixture.server.oauthProvider.Client.find(clientId);

      if (!client) {
        throw new Error("Failed to register the OAuth test client.");
      }

      const apiToken = fixture.apiTokenService.createToken(
        "Refresh principal",
        permissionsForPresets("tasks"),
      );
      const grant = new fixture.server.oauthProvider.Grant({
        accountId: apiToken.record.id,
        clientId,
      });
      grant.addResourceScope("http://localhost:3000/api/public/mcp", "mcp");
      const grantId = await grant.save();
      const refreshToken = await new fixture.server.oauthProvider.RefreshToken({
        accountId: apiToken.record.id,
        client,
        expiresWithSession: false,
        grantId,
        gty: "authorization_code",
        resource: "http://localhost:3000/api/public/mcp",
        scope: "mcp",
      }).save();
      fixture.apiTokenService.revokeToken(apiToken.record.id);

      const response = await fixture.server.inject({
        method: "POST",
        url: "/oauth/token",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "localhost:3000",
        },
        payload: new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }).toString(),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid_grant" });
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not expose the provider development interaction page", async () => {
    const fixture = await createProviderServer();

    try {
      const response = await fixture.server.inject({
        method: "GET",
        url: "/oauth/interaction/test",
        headers: { host: "localhost:3000" },
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createProviderServer(trustProxy = false) {
  const testDb = await createTestDatabase();
  const config = {
    ...testDb.config,
    security: { ...testDb.config.security, trustProxy },
  };
  const apiTokenService = createApiTokenService({ db: testDb.client.db });
  const server = createServer({
    config,
    logger: createLogger(config),
    database: testDb.client,
    apiTokenService,
    orchestrator: createOrchestrator(),
    opencodeService: createOpenCodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: {
      list: () => Promise.resolve([]),
      ensure: () => Promise.resolve(),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      buildEnvMap: () => Promise.resolve({}),
      listMissing: () => Promise.resolve([]),
    },
    scheduler: createSchedulerService(),
  });

  return {
    apiTokenService,
    server,
    async cleanup() {
      await server.close();
      await testDb.cleanup();
    },
  };
}

function createOrchestrator(): OpenCodeOrchestrator {
  const status: EngineStatus = {
    state: "healthy",
    healthy: true,
    url: "http://127.0.0.1:4100",
    workspaceDir: "/tmp/project/.cc/workspace",
    restartCount: 0,
    maxRestarts: 3,
  };

  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => status,
  };
}

function createOpenCodeService(): OpenCodeService {
  return {
    dispose: () => Promise.resolve(),
    disposeGlobal: () => Promise.resolve(),
    listProviders: () => Promise.resolve({ all: [], default: {}, connected: [] }),
    listAuthMethods: () => Promise.resolve({}),
    setApiKey: () => Promise.resolve(true),
    startOauth: () =>
      Promise.resolve({ url: "https://example.com", method: "auto", instructions: "" }),
    completeOauth: () => Promise.resolve(true),
    disconnectProvider: () => Promise.resolve(true),
  } as unknown as OpenCodeService;
}
