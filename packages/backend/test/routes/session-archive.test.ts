import { describe, expect, it } from "vitest";

import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function setup() {
  const testDb = await createTestDatabase();
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: {} as OpenCodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    scheduler: { getStatus: () => ({ state: "inactive", healthy: true, driver: "none" }) },
  });

  return { testDb, server };
}

describe("session archive settings routes", () => {
  it("returns defaults and persists updates", async () => {
    const { testDb, server } = await setup();

    try {
      const initial = await server.inject({ method: "GET", url: "/api/session-archive/settings" });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({
        sessionArchiveEnabled: true,
        sessionArchiveAppendMode: "debounced",
        sessionArchiveMaterializeIntervalMinutes: 1440,
      });

      const updated = await server.inject({
        method: "PUT",
        url: "/api/session-archive/settings",
        payload: {
          sessionArchiveEnabled: false,
          sessionArchiveAppendMode: "off",
          sessionArchiveMaterializeIntervalMinutes: 60,
        },
      });
      expect(updated.statusCode).toBe(200);

      const reloaded = await server.inject({
        method: "GET",
        url: "/api/session-archive/settings",
      });
      expect(reloaded.json()).toEqual({
        sessionArchiveEnabled: false,
        sessionArchiveAppendMode: "off",
        sessionArchiveMaterializeIntervalMinutes: 60,
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}
