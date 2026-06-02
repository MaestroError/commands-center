import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createAgentRecord,
  getSetting,
  listAgents,
  settingsReconciler,
  upsertSetting,
  upsertSettingFilefirst,
} from "../../src/db/helpers";
import { createTestDatabase } from "../helpers/db";

describe("database helpers", () => {
  it("creates and lists agents with ULID primary keys", async () => {
    const testDb = await createTestDatabase();

    try {
      const agent = await createAgentRecord(testDb.client.db, {
        name: "Coder",
        role: "developer",
        instructions: "Write TypeScript code",
      });
      const agents = await listAgents(testDb.client.db);

      expect(agent).toBeDefined();
      expect(agent!.id).toHaveLength(26);
      expect(agents).toHaveLength(1);
      expect(agents[0]?.name).toBe("Coder");
    } finally {
      await testDb.cleanup();
    }
  });

  it("upserts and reads JSON settings values", async () => {
    const testDb = await createTestDatabase();

    try {
      await upsertSetting(testDb.client.db, "theme", { mode: "dark" });
      await upsertSetting(testDb.client.db, "theme", { mode: "light" });

      await expect(getSetting<{ mode: string }>(testDb.client.db, "theme")).resolves.toEqual({
        mode: "light",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("upsertSettingFilefirst writes configuration/settings.json then upserts the DB row", async () => {
    const testDb = await createTestDatabase();

    try {
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "theme", { mode: "dark" });
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "limit", 42);

      // DB row is present
      await expect(getSetting(testDb.client.db, "theme")).resolves.toEqual({ mode: "dark" });
      await expect(getSetting(testDb.client.db, "limit")).resolves.toBe(42);

      // File exists and contains both keys
      const filePath = join(testDb.config.paths.subdirectories.configuration, "settings.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        version: number;
        settings: Record<string, unknown>;
      };
      expect(file.version).toBe(1);
      expect(file.settings["theme"]).toEqual({ mode: "dark" });
      expect(file.settings["limit"]).toBe(42);
    } finally {
      await testDb.cleanup();
    }
  });

  it("upsertSettingFilefirst overwrites an existing key in the file without losing others", async () => {
    const testDb = await createTestDatabase();

    try {
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "a", 1);
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "b", 2);
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "a", 99);

      const filePath = join(testDb.config.paths.subdirectories.configuration, "settings.json");
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        settings: Record<string, unknown>;
      };
      expect(file.settings["a"]).toBe(99);
      expect(file.settings["b"]).toBe(2);
    } finally {
      await testDb.cleanup();
    }
  });

  it("settingsReconciler populates the DB from settings.json on boot", async () => {
    const testDb = await createTestDatabase();

    try {
      // Write the file first (simulating a previous run), then reconcile
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "color", "blue");

      // Simulate fresh DB by deleting the row
      const { settings } = await import("../../src/db/schema/index.js");
      await testDb.client.db.delete(settings);
      expect(await getSetting(testDb.client.db, "color")).toBeUndefined();

      // Reconcile should restore the row
      const logger = { debug: () => {}, error: () => {} } as never;
      await settingsReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      await expect(getSetting(testDb.client.db, "color")).resolves.toBe("blue");
    } finally {
      await testDb.cleanup();
    }
  });

  it("settingsReconciler deletes DB rows that no longer exist in the file", async () => {
    const testDb = await createTestDatabase();

    try {
      // Write one key through the normal write path (creates file + row)
      await upsertSettingFilefirst(testDb.client.db, testDb.config, "keep", true);

      // Directly insert an orphaned row into DB (no matching file entry)
      await upsertSetting(testDb.client.db, "orphan", "should-be-removed");

      const logger = { debug: () => {}, error: () => {} } as never;
      await settingsReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      await expect(getSetting(testDb.client.db, "keep")).resolves.toBe(true);
      await expect(getSetting(testDb.client.db, "orphan")).resolves.toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("settingsReconciler is a no-op when the file is missing", async () => {
    const testDb = await createTestDatabase();

    try {
      await upsertSetting(testDb.client.db, "existing", "value");

      const logger = { debug: () => {}, error: () => {} } as never;
      await settingsReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      // Existing DB row untouched — no file means no-op
      await expect(getSetting(testDb.client.db, "existing")).resolves.toBe("value");
    } finally {
      await testDb.cleanup();
    }
  });
});
