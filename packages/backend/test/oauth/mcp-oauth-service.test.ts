import { describe, expect, it } from "vitest";

import { createOAuthRuntime } from "../../src/oauth/provider";
import { createApiTokenService } from "../../src/services/api-token-service";
import { permissionsForPresets } from "../helpers/api-tokens";
import { createTestDatabase } from "../helpers/db";

const RESOURCE = "http://localhost:3000/api/public/mcp";

describe("MCP OAuth service", () => {
  it("returns current API-token permissions on every access-token resolution", async () => {
    const fixture = await createFixture();

    try {
      const created = fixture.apiTokenService.createToken(
        "OAuth principal",
        permissionsForPresets("templates"),
      );
      const accessToken = await issueAccessToken(fixture, created.record.id);

      expect(
        (await fixture.runtime.service.resolveAccessToken(accessToken))?.permissions.capabilities,
      ).toContain("trigger_task_template");

      fixture.apiTokenService.updateToken(created.record.id, {
        permissions: permissionsForPresets("tasks"),
      });

      expect(
        (await fixture.runtime.service.resolveAccessToken(accessToken))?.permissions.capabilities,
      ).toContain("create_task");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an access token after its backing API token is revoked", async () => {
    const fixture = await createFixture();

    try {
      const created = fixture.apiTokenService.createToken(
        "Revoked principal",
        permissionsForPresets("tasks"),
      );
      const accessToken = await issueAccessToken(fixture, created.record.id);
      fixture.apiTokenService.revokeToken(created.record.id);

      await expect(fixture.runtime.service.resolveAccessToken(accessToken)).resolves.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an access token for a different audience", async () => {
    const fixture = await createFixture();

    try {
      const created = fixture.apiTokenService.createToken(
        "Wrong audience",
        permissionsForPresets("tasks"),
      );
      const accessToken = await issueAccessToken(
        fixture,
        created.record.id,
        "http://localhost:3000/api/public/other",
      );

      await expect(fixture.runtime.service.resolveAccessToken(accessToken)).resolves.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an access token without the mcp scope", async () => {
    const fixture = await createFixture();

    try {
      const created = fixture.apiTokenService.createToken(
        "Wrong scope",
        permissionsForPresets("tasks"),
      );
      const accessToken = await issueAccessToken(fixture, created.record.id, RESOURCE, "other");

      await expect(fixture.runtime.service.resolveAccessToken(accessToken)).resolves.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("revokes an OAuth grant without revoking the backing API token", async () => {
    const fixture = await createFixture();

    try {
      const created = fixture.apiTokenService.createToken(
        "Independent revocation",
        permissionsForPresets("tasks"),
      );
      const accessToken = await issueAccessToken(fixture, created.record.id);

      await expect(fixture.runtime.service.revokeGrantForToken(accessToken)).resolves.toBe(true);
      await expect(fixture.runtime.service.resolveAccessToken(accessToken)).resolves.toBeNull();
      expect(fixture.apiTokenService.resolveActiveTokenById(created.record.id)).not.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns false when revoking an unknown OAuth token", async () => {
    const fixture = await createFixture();

    try {
      await expect(fixture.runtime.service.revokeGrantForToken("missing")).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createFixture() {
  const testDb = await createTestDatabase();
  const apiTokenService = createApiTokenService({ db: testDb.client.db });
  const runtime = createOAuthRuntime({
    config: testDb.config,
    database: testDb.client,
    apiTokenService,
  });
  const clientAdapter = runtime.recordStore.adapterFactory("Client");
  await clientAdapter.upsert(
    "client-1",
    {
      client_id: "client-1",
      client_name: "Test client",
      client_id_issued_at: Math.floor(Date.now() / 1_000),
      grant_types: ["authorization_code", "refresh_token"],
      id_token_signed_response_alg: "EdDSA",
      redirect_uris: ["http://127.0.0.1/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    Number.POSITIVE_INFINITY,
  );
  const client = await runtime.provider.Client.find("client-1");

  if (!client) {
    throw new Error("Failed to create the OAuth test client.");
  }

  return {
    apiTokenService,
    client,
    runtime,
    async cleanup() {
      await testDb.cleanup();
    },
  };
}

async function issueAccessToken(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  accountId: string,
  audience = RESOURCE,
  scope = "mcp",
): Promise<string> {
  const grant = new fixture.runtime.provider.Grant({
    accountId,
    clientId: fixture.client.clientId,
  });
  grant.addResourceScope(RESOURCE, "mcp");
  const grantId = await grant.save();
  const token = new fixture.runtime.provider.AccessToken({
    accountId,
    aud: audience,
    client: fixture.client,
    grantId,
    gty: "authorization_code",
    scope,
  });

  return token.save();
}
