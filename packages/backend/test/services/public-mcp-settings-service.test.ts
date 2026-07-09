import { describe, expect, it } from "vitest";

import { createPublicMcpSettingsService } from "../../src/services/public-mcp-settings-service";
import { createTestDatabase } from "../helpers/db";

describe("createPublicMcpSettingsService", () => {
  it("returns the default cap when no settings file exists", async () => {
    const testDb = await createTestDatabase();
    const service = createPublicMcpSettingsService({ config: testDb.config });

    try {
      expect(await service.get()).toEqual({ syncToolWaitCapSeconds: 120 });
    } finally {
      await testDb.cleanup();
    }
  });

  it("persists and reads back an updated cap", async () => {
    const testDb = await createTestDatabase();
    const service = createPublicMcpSettingsService({ config: testDb.config });

    try {
      const updated = await service.update({ syncToolWaitCapSeconds: 30 });
      expect(updated).toEqual({ syncToolWaitCapSeconds: 30 });
      expect(await service.get()).toEqual({ syncToolWaitCapSeconds: 30 });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects a cap outside the allowed range", async () => {
    const testDb = await createTestDatabase();
    const service = createPublicMcpSettingsService({ config: testDb.config });

    try {
      await expect(service.update({ syncToolWaitCapSeconds: 601 })).rejects.toThrow();
      await expect(service.update({ syncToolWaitCapSeconds: -1 })).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });
});
