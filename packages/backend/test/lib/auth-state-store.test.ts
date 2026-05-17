import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createAuthStateStore, type OwnerAccessState } from "../../src/lib/auth-state-store";
import { createTestDatabase } from "../helpers/db";

describe("createAuthStateStore", () => {
  it("supports concurrent writes without temp file collisions", async () => {
    const testDb = await createTestDatabase();
    const store = createAuthStateStore(
      resolve(testDb.config.paths.subdirectories.auth, "state.json"),
    );
    const timestamp = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const first = createState(timestamp);
    const second = createState(timestamp);

    try {
      first.sessions = [
        {
          idHash: "first-session",
          createdAt: timestamp,
          lastUsedAt: timestamp,
          expiresAt: timestamp,
        },
      ];
      second.sessions = [
        {
          idHash: "second-session",
          createdAt: timestamp,
          lastUsedAt: timestamp,
          expiresAt: timestamp,
        },
      ];

      await expect(Promise.all([store.write(first), store.write(second)])).resolves.toBeDefined();
      await expect(readFile(store.path, "utf8")).resolves.toContain("session");
    } finally {
      await testDb.cleanup();
    }
  });
});

function createState(timestamp: string): OwnerAccessState {
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    sessions: [],
    rateLimits: {
      claimAttempts: [],
      reclaimAttempts: [],
      loginAttempts: [],
    },
  };
}
