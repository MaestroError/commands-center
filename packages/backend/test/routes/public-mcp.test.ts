import { describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskService } from "../../src/services/task-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTestDatabase } from "../helpers/db";
import { permissionsForPresets } from "../helpers/api-tokens";

type InjectServer = Awaited<ReturnType<typeof createServer>>;

describe("public MCP route", () => {
  it("rejects requests without a bearer token", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/public/mcp",
        headers: {
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: initializePayload(1),
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists only the tools the token's capabilities grant", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const templatesToken = apiTokenService.createToken(
        "Templates",
        permissionsForPresets("templates"),
      ).token;
      const tasksToken = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;

      const templatesTools = (await callMcp(server, templatesToken, "tools/list", {}, 1)).body;
      expect(templatesTools).toContain('"name":"list_task_templates"');
      expect(templatesTools).toContain('"name":"task_template_run"');
      expect(templatesTools).toContain('"name":"get_task_result"');
      expect(templatesTools).not.toContain('"name":"create_task"');
      expect(templatesTools).not.toContain('"name":"task_run"');
      expect(templatesTools).not.toContain('"name":"list_tasks"');

      const tasksTools = (await callMcp(server, tasksToken, "tools/list", {}, 2)).body;
      expect(tasksTools).toContain('"name":"create_task"');
      expect(tasksTools).toContain('"name":"list_tasks"');
      expect(tasksTools).toContain('"name":"task_run"');
      // get_task_result maps to the templates-group get_task_run capability.
      expect(tasksTools).not.toContain('"name":"get_task_result"');
      expect(tasksTools).not.toContain('"name":"task_template_run"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("exposes async run variants only when the token can poll results", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      // tasks preset alone lacks the templates-group get_task_run capability.
      const noPoll = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const withPoll = apiTokenService.createToken(
        "Both",
        permissionsForPresets("tasks", "templates"),
      ).token;

      const noPollTools = (await callMcp(server, noPoll, "tools/list", {}, 1)).body;
      expect(noPollTools).toContain('"name":"task_run"');
      expect(noPollTools).not.toContain('"name":"task_run_async"');

      const withPollTools = (await callMcp(server, withPoll, "tools/list", {}, 2)).body;
      expect(withPollTools).toContain('"name":"task_run_async"');
      expect(withPollTools).toContain('"name":"task_template_run_async"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reads and updates the sync-wait cap setting", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const initial = await server.inject({ method: "GET", url: "/api/public-mcp/settings" });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({ syncToolWaitCapSeconds: 120 });

      const updated = await server.inject({
        method: "PUT",
        url: "/api/public-mcp/settings",
        payload: { syncToolWaitCapSeconds: 45 },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toEqual({ syncToolWaitCapSeconds: 45 });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves a read tool and returns a leak-free projection", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, taskService);

    try {
      const agentId = await insertAgent(testDb.client.db);
      await taskService.create({
        agentId,
        title: "Audit staging logs",
        description: "Review the logs.",
      });
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;

      const response = await callMcp(server, token, "tools/call", {
        name: "list_tasks",
        arguments: {},
      });

      expect(response.statusCode).toBe(200);
      const json = parseSseJson(response.body) as {
        result?: { structuredContent?: { tasks?: Array<Record<string, unknown>> } };
      };
      const tasks = json.result?.structuredContent?.tasks ?? [];
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ title: "Audit staging logs" });
      // Public projection must not leak engine internals. `specialistId` is a
      // deliberate public field, so agentId itself is expected in the payload.
      expect(response.body).not.toContain("permissionProfile");
      expect(response.body).not.toContain("renderedPrompt");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns a run result via get_task_result", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, taskService);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId,
        title: "Result task",
        description: "Produce a result.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "completed",
        triggerSource: "api",
        renderedPrompt: "Do it.",
        resultText: "All done.",
      });
      // get_task_result maps to the templates-group get_task_run capability.
      const token = apiTokenService.createToken(
        "Templates",
        permissionsForPresets("templates"),
      ).token;

      const response = await callMcp(server, token, "tools/call", {
        name: "get_task_result",
        arguments: { runId: run.id },
      });

      expect(response.statusCode).toBe(200);
      expect(parseSseJson(response.body)).toMatchObject({
        result: {
          structuredContent: {
            runId: run.id,
            taskId: task.id,
            status: "completed",
            resultText: "All done.",
            timedOut: false,
          },
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function buildServer(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  apiTokenService: ReturnType<typeof createApiTokenService> = createApiTokenService({
    db: testDb.client.db,
  }),
  taskService?: ReturnType<typeof createTaskService>,
): Promise<InjectServer> {
  const resolvedTaskService =
    taskService ?? createTaskService({ db: testDb.client.db, config: testDb.config });
  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} } as never,
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    taskService: resolvedTaskService,
    taskExecutionService: createTaskExecutionService({ taskService: resolvedTaskService }),
  });
}

async function callMcp(
  server: InjectServer,
  token: string,
  method: string,
  params: Record<string, unknown>,
  id = 1,
) {
  return server.inject({
    method: "POST",
    url: "/api/public/mcp",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    payload: { jsonrpc: "2.0", id, method, params },
  });
}

function initializePayload(id: number) {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  };
}

function parseSseJson(body: string): unknown {
  const dataLine = body
    .split("\n")
    .find(
      (line) => line.startsWith("data: ") && line.slice("data: ".length).trim().startsWith("{"),
    );

  if (!dataLine) {
    throw new Error(`Expected SSE data line in response: ${body}`);
  }

  return JSON.parse(dataLine.slice("data: ".length));
}

async function insertAgent(db: AppDb): Promise<string> {
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-public-mcp",
      slug: "public-mcp-agent",
      name: "Public MCP Agent",
      role: "run tasks",
      instructions: "Run tasks.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify({ appMcpServers: [], appToolPermissions: [] }),
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert agent.");
  }

  return agent.id;
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
