import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSecretService, secretsManifestReconciler } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";

describe("secret-service", () => {
  it("creates placeholder secrets and reports missing values", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.ensure(["CC_TEST_TOKEN"]);

      await expect(service.list()).resolves.toMatchObject([
        {
          key: "CC_TEST_TOKEN",
          isSet: false,
          stale: false,
        },
      ]);
      await expect(service.listMissing(["CC_TEST_TOKEN"])).resolves.toEqual(["CC_TEST_TOKEN"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("encrypts values and exposes them through the injected env map", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.set("CC_TEST_TOKEN", "super-secret-value");

      await expect(service.list()).resolves.toMatchObject([
        {
          key: "CC_TEST_TOKEN",
          isSet: true,
          stale: false,
        },
      ]);
      await expect(service.buildEnvMap()).resolves.toEqual({
        CC_TEST_TOKEN: "super-secret-value",
      });
      await expect(service.listMissing(["CC_TEST_TOKEN"])).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not rewrite an unchanged secret value", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      expect(await service.set("CC_TEST_TOKEN", "same-value")).toBe(true);
      const [before] = await service.list();

      expect(await service.set("CC_TEST_TOKEN", "same-value")).toBe(false);
      const [after] = await service.list();

      expect(after?.updatedAt).toBe(before?.updatedAt);
    } finally {
      await testDb.cleanup();
    }
  });

  it("reports the newest update among set secrets", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.set("SET_KEY", "value");
      await service.ensure(["MISSING_KEY"]);

      const setSecret = (await service.list()).find((secret) => secret.key === "SET_KEY");

      await expect(service.getLatestSetUpdate(["SET_KEY", "MISSING_KEY"])).resolves.toEqual(
        setSecret ? new Date(setSecret.updatedAt) : undefined,
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("set writes the key to configuration/secrets.json without the value", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.set("MY_KEY", "super-secret");

      const filePath = join(testDb.config.paths.subdirectories.configuration, "secrets.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        version: number;
        keys: Array<{ key: string }>;
      };

      expect(file.version).toBe(1);
      expect(file.keys.map((k) => k.key)).toContain("MY_KEY");
      // The file must NOT contain the plain value
      expect(JSON.stringify(file)).not.toContain("super-secret");
    } finally {
      await testDb.cleanup();
    }
  });

  it("ensure adds new keys to configuration/secrets.json", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.ensure(["KEY_A", "KEY_B"]);

      const filePath = join(testDb.config.paths.subdirectories.configuration, "secrets.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        keys: Array<{ key: string }>;
      };
      const keys = file.keys.map((k) => k.key);
      expect(keys).toContain("KEY_A");
      expect(keys).toContain("KEY_B");
    } finally {
      await testDb.cleanup();
    }
  });

  it("delete removes the key from configuration/secrets.json", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.ensure(["KEEP", "REMOVE"]);
      await service.delete("REMOVE");

      const filePath = join(testDb.config.paths.subdirectories.configuration, "secrets.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        keys: Array<{ key: string }>;
      };
      const keys = file.keys.map((k) => k.key);
      expect(keys).toContain("KEEP");
      expect(keys).not.toContain("REMOVE");
    } finally {
      await testDb.cleanup();
    }
  });

  it("treats secrets encrypted with a different key as missing", async () => {
    const testDb = await createTestDatabase();
    const writer = createSecretService({ db: testDb.client.db, config: testDb.config });
    const reader = createSecretService({
      db: testDb.client.db,
      config: { ...testDb.config, secretKey: "different-secret-key" },
    });

    try {
      await writer.set("CC_TEST_TOKEN", "super-secret-value");

      await expect(reader.list()).resolves.toMatchObject([
        {
          key: "CC_TEST_TOKEN",
          isSet: false,
          stale: true,
        },
      ]);
      await expect(reader.buildEnvMap()).resolves.toEqual({});
      await expect(reader.listMissing(["CC_TEST_TOKEN"])).resolves.toEqual(["CC_TEST_TOKEN"]);
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("secretsManifestReconciler", () => {
  it("seeds DB rows with null values for keys found in the manifest", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      // Write manifest via normal flow (set creates the manifest)
      await service.set("SEED_KEY", "original-value");

      // Simulate fresh DB by deleting the secrets table
      const { secrets } = await import("../../src/db/schema/index.js");
      await testDb.client.db.delete(secrets);

      expect(await service.list()).toHaveLength(0);

      const logger = { debug: () => {}, error: () => {} } as never;
      await secretsManifestReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      // Key exists in DB but value is null (cannot be recovered)
      const listed = await service.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.key).toBe("SEED_KEY");
      expect(listed[0]?.isSet).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not restore secret values — only the key placeholders", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      await service.set("IMPORTANT_KEY", "plaintext-value");

      const { secrets } = await import("../../src/db/schema/index.js");
      await testDb.client.db.delete(secrets);

      const logger = { debug: () => {}, error: () => {} } as never;
      await secretsManifestReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      // Value is gone — buildEnvMap should return empty
      await expect(service.buildEnvMap()).resolves.toEqual({});
    } finally {
      await testDb.cleanup();
    }
  });

  it("is a no-op when the manifest file is missing", async () => {
    const testDb = await createTestDatabase();
    const service = createSecretService({ db: testDb.client.db, config: testDb.config });

    try {
      // No manifest file written — reconciler must leave the DB untouched
      const logger = { debug: () => {}, error: () => {} } as never;
      await secretsManifestReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      expect(await service.list()).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });
});
