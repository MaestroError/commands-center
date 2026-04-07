import { describe, expect, it } from "vitest";

import { createAgentRecord, getSetting, listAgents, upsertSetting } from "../../src/db/helpers";
import { createTestDatabase } from "../helpers/db";

describe("database helpers", () => {
  it("creates and lists agents with ULID primary keys", async () => {
    const testDb = await createTestDatabase();

    try {
      const agent = await createAgentRecord(testDb.client.db, {
        name: "Coder",
        role: "developer",
        instructions: "Write TypeScript code",
        workspacePath: "/tmp/project/.cc/workspace/agents/coder",
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
      await upsertSetting(testDb.client.db, "theme", {
        mode: "dark",
      });
      await upsertSetting(testDb.client.db, "theme", {
        mode: "light",
      });

      await expect(getSetting<{ mode: string }>(testDb.client.db, "theme")).resolves.toEqual({
        mode: "light",
      });
    } finally {
      await testDb.cleanup();
    }
  });
});
