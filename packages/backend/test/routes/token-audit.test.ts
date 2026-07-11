import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createDocumentService } from "../../src/services/document-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskService } from "../../src/services/task-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTokenAuditService } from "../../src/services/token-audit-service";
import { createTestDatabase } from "../helpers/db";
import { permissionsForPresets } from "../helpers/api-tokens";

type InjectServer = Awaited<ReturnType<typeof createServer>>;

describe("per-token execution audit", () => {
  it("records authenticated public REST calls, including forbidden attempts", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, audit);

    try {
      const tasksToken = apiTokenService.createToken("Tasks", permissionsForPresets("tasks"));
      const templatesToken = apiTokenService.createToken(
        "Templates",
        permissionsForPresets("templates"),
      );

      // Allowed: list tasks.
      const ok = await server.inject({
        method: "GET",
        url: "/api/public/v1/tasks",
        headers: { authorization: `Bearer ${tasksToken.token}` },
      });
      expect(ok.statusCode).toBe(200);

      // Forbidden: templates token cannot list tasks (403), but is still audited.
      const forbidden = await server.inject({
        method: "GET",
        url: "/api/public/v1/tasks",
        headers: { authorization: `Bearer ${templatesToken.token}` },
      });
      expect(forbidden.statusCode).toBe(403);

      const tasksActivity = await audit.listForToken({ tokenId: tasksToken.record.id });
      expect(tasksActivity.entries).toHaveLength(1);
      expect(tasksActivity.entries[0]).toMatchObject({
        surface: "rest",
        action: "GET /api/public/v1/tasks",
        capabilityId: "list_tasks",
        outcome: "ok",
        statusCode: 200,
      });

      const templatesActivity = await audit.listForToken({ tokenId: templatesToken.record.id });
      expect(templatesActivity.entries[0]).toMatchObject({
        outcome: "error",
        statusCode: 403,
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("records MCP tool calls and serves them via the activity endpoint", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, audit);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks"));

      const response = await server.inject({
        method: "POST",
        url: "/api/public/mcp",
        headers: {
          authorization: `Bearer ${token.token}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_tasks", arguments: {} },
        },
      });
      expect(response.statusCode).toBe(200);

      const activity = await server.inject({
        method: "GET",
        url: `/api/api-tokens/${token.record.id}/activity`,
      });
      expect(activity.statusCode).toBe(200);
      const body = activity.json<{
        entries: Array<{ surface: string; action: string; outcome: string }>;
      }>();
      expect(body.entries.some((e) => e.surface === "mcp" && e.action === "list_tasks")).toBe(true);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("records a scoped document target for public REST reads", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, audit);

    try {
      const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
      await documents.create({
        scope: "global",
        path: "shared/brief.md",
        content: "Deployment brief",
      });
      const token = apiTokenService.createToken("Documents", {
        ...permissionsForPresets("documents"),
        documents: { global: true, privateSpecialistIds: [] },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/public/v1/documents/read?scope=global&path=shared%2Fbrief.md",
        headers: { authorization: `Bearer ${token.token}` },
      });
      expect(response.statusCode).toBe(200);

      await expect
        .poll(async () => (await audit.listForToken({ tokenId: token.record.id })).entries)
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              surface: "rest",
              action: "GET /api/public/v1/documents/read",
              targetKind: "document",
              targetId: "global:shared/brief.md",
            }),
          ]),
        );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reads and updates the retention setting", async () => {
    const testDb = await createTestDatabase();
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(
      testDb,
      createApiTokenService({ db: testDb.client.db }),
      audit,
    );

    try {
      const initial = await server.inject({ method: "GET", url: "/api/api-tokens/audit-settings" });
      expect(initial.json()).toEqual({ retentionWeeks: 4 });

      const updated = await server.inject({
        method: "PUT",
        url: "/api/api-tokens/audit-settings",
        payload: { retentionWeeks: 12 },
      });
      expect(updated.json()).toEqual({ retentionWeeks: 12 });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function buildServer(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  apiTokenService: ReturnType<typeof createApiTokenService>,
  tokenAuditService: ReturnType<typeof createTokenAuditService>,
): Promise<InjectServer> {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService,
    tokenAuditService,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} } as never,
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    taskService,
    taskExecutionService: createTaskExecutionService({ taskService }),
  });
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: () => Promise.resolve(),
    disposeGlobal: () => Promise.resolve(),
  } as unknown as OpenCodeService;
}
