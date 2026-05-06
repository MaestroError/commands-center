import { describe, expect, it } from "vitest";

import { createSecretService } from "../../src/services/secret-service";
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
