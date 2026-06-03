import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api_tokens } from "../../src/db/schema/index";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createTestDatabase } from "../helpers/db";

describe("createApiTokenService", () => {
  it("stores only the token hash and returns the raw token once", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken("Release automation", ["templates"]);
      const row = await testDb.client.db.query.api_tokens.findFirst({
        where: (table, operators) => operators.eq(table.id, result.record.id),
      });

      expect(result.token).toMatch(/^cc_/);
      expect(result.record).toMatchObject({
        name: "Release automation",
        tokenPrefix: result.token.slice(0, 12),
        scopes: ["templates"],
        lastUsedAt: null,
        revokedAt: null,
      });
      expect(row?.token_hash).toHaveLength(64);
      expect(row?.token_hash).not.toContain(result.token);
    } finally {
      await testDb.cleanup();
    }
  });

  it("validates active tokens and updates last used time", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken("Board automation", ["templates", "tasks"]);
      const validated = service.validateToken(result.token);

      expect(validated).toMatchObject({
        id: result.record.id,
        scopes: ["templates", "tasks"],
      });
      expect(validated?.lastUsedAt).toEqual(expect.any(Number));
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not validate revoked tokens", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken("Old token", ["tasks"]);

      expect(service.revokeToken(result.record.id)).toBe(true);
      expect(service.validateToken(result.token)).toBeNull();
      expect(service.listTokens()[0]).toMatchObject({
        id: result.record.id,
        revokedAt: expect.any(Number),
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects tokens with no scopes", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(() => service.createToken("No access", [])).toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns false when revoking a missing token", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(service.revokeToken("missing")).toBe(false);
      expect(
        await testDb.client.db.select().from(api_tokens).where(eq(api_tokens.id, "missing")),
      ).toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });
});
