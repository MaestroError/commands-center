import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { agents, api_tokens } from "../../src/db/schema/index";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createId, now } from "../../src/db/ids";
import { createTestDatabase } from "../helpers/db";
import { permissionsForCapabilities, permissionsForPresets } from "../helpers/api-tokens";

describe("createApiTokenService", () => {
  it("stores only the token hash and returns the raw token once", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken("Release automation", permissionsForPresets("templates"));
      const row = await testDb.client.db.query.api_tokens.findFirst({
        where: (table, operators) => operators.eq(table.id, result.record.id),
      });

      expect(result.token).toMatch(/^cc_/);
      expect(result.record).toMatchObject({
        name: "Release automation",
        tokenPrefix: result.token.slice(0, 12),
        permissions: {
          capabilities: ["list_task_templates", "trigger_task_template", "get_task_run"],
          templates: [],
        },
        lastUsedAt: null,
        revokedAt: null,
      });
      // Fail-closed on rollback: legacy scopes_json is emptied for new tokens.
      expect(row?.scopes_json).toBe("[]");
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
      const result = service.createToken(
        "Board automation",
        permissionsForPresets("templates", "tasks"),
      );
      const validated = service.validateToken(result.token);

      expect(validated?.id).toBe(result.record.id);
      expect(validated?.permissions.capabilities).toContain("trigger_task_template");
      expect(validated?.permissions.capabilities).toContain("create_task");
      expect(validated?.lastUsedAt).toEqual(expect.any(Number));
    } finally {
      await testDb.cleanup();
    }
  });

  it("stores capabilities in catalog order regardless of input order", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken(
        "Ordered",
        permissionsForCapabilities("get_task_run", "list_task_templates"),
      );

      expect(result.record.permissions.capabilities).toEqual([
        "list_task_templates",
        "get_task_run",
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects unknown capability ids", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(() =>
        service.createToken("Bad", {
          capabilities: ["not_a_real_capability"],
          templates: [],
          documents: { global: false, privateSpecialistIds: [] },
        }),
      ).toThrow(/Unknown token capability/);
    } finally {
      await testDb.cleanup();
    }
  });

  it("edits a token's permissions in place without changing the secret", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const created = service.createToken("Editable", permissionsForPresets("templates"));
      const updated = service.updateToken(created.record.id, {
        name: "Renamed",
        permissions: permissionsForPresets("tasks"),
      });

      expect(updated?.name).toBe("Renamed");
      expect(updated?.permissions.capabilities).toContain("create_task");
      // The original secret still validates after the edit.
      expect(service.validateToken(created.token)?.permissions.capabilities).toContain(
        "create_task",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns null when editing a missing or revoked token", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(
        service.updateToken("missing", { permissions: permissionsForPresets("tasks") }),
      ).toBeNull();

      const created = service.createToken("Doomed", permissionsForPresets("tasks"));
      service.revokeToken(created.record.id);
      expect(
        service.updateToken(created.record.id, { permissions: permissionsForPresets("templates") }),
      ).toBeNull();
    } finally {
      await testDb.cleanup();
    }
  });

  it("maps legacy scoped tokens to capabilities, including the either list endpoint", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      // Simulate a pre-capability token: scopes_json set, permissions_json null.
      const timestamp = now();
      await testDb.client.db.insert(api_tokens).values({
        id: createId(),
        name: "Legacy tasks",
        token_hash: "a".repeat(64),
        token_prefix: "cc_legacy000",
        scopes_json: JSON.stringify(["tasks"]),
        permissions_json: null,
        created_at: timestamp,
        last_used_at: null,
        revoked_at: null,
      });

      const record = service.listTokens()[0];
      expect(record?.permissions.capabilities).toContain("create_task");
      // The old `tasks` scope also granted template listing (the `either` route).
      expect(record?.permissions.capabilities).toContain("list_task_templates");
      expect(record?.permissions.capabilities).not.toContain("trigger_task_template");
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not validate revoked tokens", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const result = service.createToken("Old token", permissionsForPresets("tasks"));

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

  it("rejects tokens with no permissions", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(() =>
        service.createToken("No access", {
          capabilities: [],
          templates: [],
          documents: { global: false, privateSpecialistIds: [] },
        }),
      ).toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("stores global and selected private document roots deterministically", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const timestamp = new Date();
      await testDb.client.db.insert(agents).values([
        {
          id: "specialist-b",
          slug: "b",
          name: "B",
          role: "B",
          instructions: "B",
          default_model: "openai/gpt-4.1",
          status: "active",
          capabilities_json: "{}",
          created_at: timestamp,
          updated_at: timestamp,
        },
        {
          id: "specialist-a",
          slug: "a",
          name: "A",
          role: "A",
          instructions: "A",
          default_model: "openai/gpt-4.1",
          status: "active",
          capabilities_json: "{}",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ]);

      const created = service.createToken("Docs", {
        capabilities: ["read_document"],
        templates: [],
        documents: {
          global: true,
          privateSpecialistIds: ["specialist-b", "specialist-a", "specialist-b"],
        },
      });

      expect(created.record.permissions.documents).toEqual({
        global: true,
        privateSpecialistIds: ["specialist-a", "specialist-b"],
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects document capabilities without a root", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(() =>
        service.createToken("Docs", {
          capabilities: ["read_document"],
          templates: [],
          documents: { global: false, privateSpecialistIds: [] },
        }),
      ).toThrow(/document root/i);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects unknown private document specialists", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      expect(() =>
        service.createToken("Docs", {
          capabilities: ["list_documents"],
          templates: [],
          documents: { global: false, privateSpecialistIds: ["missing"] },
        }),
      ).toThrow(/unknown or inactive specialist/i);
    } finally {
      await testDb.cleanup();
    }
  });

  it("clears document roots when document capabilities are removed", async () => {
    const testDb = await createTestDatabase();
    const service = createApiTokenService({ db: testDb.client.db });

    try {
      const created = service.createToken("Docs", {
        capabilities: ["read_document"],
        templates: [],
        documents: { global: true, privateSpecialistIds: [] },
      });
      const updated = service.updateToken(created.record.id, {
        permissions: {
          capabilities: ["list_tasks"],
          templates: [],
          documents: { global: true, privateSpecialistIds: [] },
        },
      });

      expect(updated?.permissions.documents).toEqual({
        global: false,
        privateSpecialistIds: [],
      });
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
