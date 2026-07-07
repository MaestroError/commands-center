import { describe, expect, it } from "vitest";

import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

function createOrchestrator(): OpenCodeOrchestrator {
  return {} as OpenCodeOrchestrator;
}

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
  } as never);

  return { testDb, server };
}

describe("system prompt routes", () => {
  it("lists definitions (metadata) and the variable catalog", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({ method: "GET", url: "/api/system-prompts" });
      expect(response.statusCode).toBe(200);

      const body = response.json<{
        prompts: { id: string; isCustomized: boolean }[];
        variables: { id: string }[];
      }>();
      expect(body.prompts.map((prompt) => prompt.id)).toEqual([
        "identity",
        "global-chat",
        "global-task",
        "additional",
        "mcp-instructions-notifications",
        "mcp-instructions-app",
        "mcp-instructions-specialist-management",
        "mcp-instructions-tasks-management",
      ]);
      // metadata only — no defaultBody leaks through the list endpoint
      expect(body.prompts[0]).not.toHaveProperty("defaultBody");
      expect(body.prompts.every((prompt) => prompt.isCustomized === false)).toBe(true);
      expect(body.variables.some((variable) => variable.id === "APP_NAME")).toBe(true);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns a single prompt with body, defaultBody, and isCustomized", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({ method: "GET", url: "/api/system-prompts/identity" });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.definition.id).toBe("identity");
      expect(body.isCustomized).toBe(false);
      expect(body.body).toBe(body.defaultBody);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("404s for an unknown prompt id", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({ method: "GET", url: "/api/system-prompts/nope" });
      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("PUT saves a body and flips isCustomized; DELETE restores the default", async () => {
    const { testDb, server } = await setup();
    try {
      const put = await server.inject({
        method: "PUT",
        url: "/api/system-prompts/identity",
        payload: { body: "custom identity" },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().isCustomized).toBe(true);
      expect(put.json().body).toBe("custom identity");

      const afterPut = await server.inject({ method: "GET", url: "/api/system-prompts/identity" });
      expect(afterPut.json().body).toBe("custom identity");

      const del = await server.inject({
        method: "DELETE",
        url: "/api/system-prompts/identity",
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().isCustomized).toBe(false);
      expect(del.json().body).toBe(del.json().defaultBody);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects an empty body for a required prompt", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({
        method: "PUT",
        url: "/api/system-prompts/identity",
        payload: { body: "   " },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows an empty body for the optional additional prompt", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({
        method: "PUT",
        url: "/api/system-prompts/additional",
        payload: { body: "" },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});
