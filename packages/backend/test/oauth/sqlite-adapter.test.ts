import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "../../src/db/client";
import { migrateDatabase } from "../../src/db/migrate";
import { createOAuthRecordStore, OAuthClientLimitError } from "../../src/oauth/sqlite-adapter";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createTestDatabase } from "../helpers/db";

describe("OAuth SQLite adapter", () => {
  it("upserts and finds a provider payload", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const adapter = store.adapterFactory("AccessToken");

    try {
      await adapter.upsert("access-1", { accountId: "token-1", scope: "mcp" }, 60);

      await expect(adapter.find("access-1")).resolves.toMatchObject({
        accountId: "token-1",
        scope: "mcp",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("finds records by user code within the adapter model", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const adapter = store.adapterFactory("DeviceCode");

    try {
      await adapter.upsert("device-1", { userCode: "ABCD-EFGH" }, 60);

      await expect(adapter.findByUserCode("ABCD-EFGH")).resolves.toMatchObject({
        userCode: "ABCD-EFGH",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("finds records by interaction uid within the adapter model", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const adapter = store.adapterFactory("Interaction");

    try {
      await adapter.upsert("interaction-1", { uid: "interaction-uid" }, 60);

      await expect(adapter.findByUid("interaction-uid")).resolves.toMatchObject({
        uid: "interaction-uid",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("marks a code consumed only once", async () => {
    const testDb = await createTestDatabase();
    let currentDate = new Date("2026-07-22T10:00:00.000Z");
    const store = createOAuthRecordStore({
      db: testDb.client.db,
      getCurrentDate: () => currentDate,
    });
    const adapter = store.adapterFactory("AuthorizationCode");

    try {
      await adapter.upsert("code-1", { accountId: "token-1" }, 60);
      await adapter.consume("code-1");
      currentDate = new Date("2026-07-22T10:00:05.000Z");
      await adapter.consume("code-1");

      await expect(adapter.find("code-1")).resolves.toMatchObject({
        consumed: Math.floor(new Date("2026-07-22T10:00:00.000Z").getTime() / 1_000),
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("destroys a single provider record", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const adapter = store.adapterFactory("AccessToken");

    try {
      await adapter.upsert("access-1", { accountId: "token-1" }, 60);
      await adapter.destroy("access-1");

      await expect(adapter.find("access-1")).resolves.toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("revokes grant records in the current adapter model", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const accessAdapter = store.adapterFactory("AccessToken");

    try {
      await accessAdapter.upsert("access-1", { grantId: "grant-1" }, 60);
      await accessAdapter.revokeByGrantId("grant-1");

      await expect(accessAdapter.find("access-1")).resolves.toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("leaves grant records in other adapter models for their adapters to revoke", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db });
    const accessAdapter = store.adapterFactory("AccessToken");
    const refreshAdapter = store.adapterFactory("RefreshToken");

    try {
      await accessAdapter.upsert("access-1", { grantId: "grant-1" }, 60);
      await refreshAdapter.upsert("refresh-1", { grantId: "grant-1" }, 60);
      await accessAdapter.revokeByGrantId("grant-1");

      await expect(refreshAdapter.find("refresh-1")).resolves.toMatchObject({
        grantId: "grant-1",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not return expired provider records", async () => {
    const testDb = await createTestDatabase();
    let currentDate = new Date("2026-07-22T10:00:00.000Z");
    const store = createOAuthRecordStore({
      db: testDb.client.db,
      getCurrentDate: () => currentDate,
    });
    const adapter = store.adapterFactory("AccessToken");

    try {
      await adapter.upsert("access-1", { accountId: "token-1" }, 10);
      currentDate = new Date("2026-07-22T10:00:10.000Z");

      await expect(adapter.find("access-1")).resolves.toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("cleans expired records in bounded batches", async () => {
    const testDb = await createTestDatabase();
    let currentDate = new Date("2026-07-22T10:00:00.000Z");
    const store = createOAuthRecordStore({
      db: testDb.client.db,
      getCurrentDate: () => currentDate,
    });
    const adapter = store.adapterFactory("AccessToken");

    try {
      await adapter.upsert("access-1", {}, 10);
      await adapter.upsert("access-2", {}, 10);
      currentDate = new Date("2026-07-22T10:00:11.000Z");

      expect(store.cleanupExpired(1)).toBe(1);
      expect(store.cleanupExpired(1)).toBe(1);
      expect(store.cleanupExpired(1)).toBe(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("enforces the dynamically registered client cap", async () => {
    const testDb = await createTestDatabase();
    const store = createOAuthRecordStore({ db: testDb.client.db, clientLimit: 1 });
    const adapter = store.adapterFactory("Client");

    try {
      await adapter.upsert("client-1", { client_id: "client-1" }, Number.POSITIVE_INFINITY);

      await expect(
        adapter.upsert("client-2", { client_id: "client-2" }, Number.POSITIVE_INFINITY),
      ).rejects.toBeInstanceOf(OAuthClientLimitError);
    } finally {
      await testDb.cleanup();
    }
  });

  it("persists provider records across database restarts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-oauth-adapter-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const firstClient = createDatabaseClient(config);
    migrateDatabase(firstClient.db);
    const firstStore = createOAuthRecordStore({ db: firstClient.db });
    await firstStore
      .adapterFactory("RefreshToken")
      .upsert("refresh-1", { accountId: "token-1" }, 60);
    firstClient.close();

    const secondClient = createDatabaseClient(config);
    migrateDatabase(secondClient.db);

    try {
      const secondStore = createOAuthRecordStore({ db: secondClient.db });

      await expect(
        secondStore.adapterFactory("RefreshToken").find("refresh-1"),
      ).resolves.toMatchObject({ accountId: "token-1" });
    } finally {
      secondClient.close();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
