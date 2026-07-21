import { describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
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
import { createTestDatabase } from "../helpers/db";
import { permissionsForPresets } from "../helpers/api-tokens";

type InjectServer = Awaited<ReturnType<typeof createServer>>;

describe("public MCP route", () => {
  it("rejects requests without a token", async () => {
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

  it("accepts a URL key token for MCP requests", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const response = await callMcpWithUrlToken(server, token, "tools/list", {}, 1);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"name":"list_tasks"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects invalid URL key tokens for MCP requests", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const response = await callMcpWithUrlToken(server, "cc_invalid", "tools/list", {}, 1);

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects revoked URL key tokens for MCP requests", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks"));
      expect(apiTokenService.revokeToken(token.record.id)).toBe(true);

      const response = await callMcpWithUrlToken(server, token.token, "tools/list", {}, 1);

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("does not let URL key auth bypass an invalid bearer token", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const response = await server.inject({
        method: "POST",
        url: `/api/public/mcp?key=${encodeURIComponent(token)}`,
        headers: {
          Authorization: "Bearer cc_invalid",
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("does not let URL key auth bypass an empty authorization header", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const response = await server.inject({
        method: "POST",
        url: `/api/public/mcp?key=${encodeURIComponent(token)}`,
        headers: {
          Authorization: "",
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("keeps URL key auth scoped away from public REST routes", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const response = await server.inject({
        method: "GET",
        url: `/api/public/v1/tasks?key=${encodeURIComponent(token)}`,
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

  it("lists and calls document tools within token-authorized roots", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
      await documents.create({
        scope: "global",
        path: "shared/brief.md",
        content: "Deployment brief",
      });
      await documents.create({
        scope: "global",
        path: "shared/overview.md",
        content: "Deployment overview",
      });
      const token = apiTokenService.createToken("Documents", {
        capabilities: ["list_documents", "search_documents", "read_document"],
        templates: [],
        documents: { global: true, globalFolderPaths: [], privateSpecialistIds: [] },
      }).token;

      const tools = (await callMcp(server, token, "tools/list", {}, 1)).body;
      expect(tools).toContain('"name":"list_documents"');
      expect(tools).toContain('"name":"search_documents"');
      expect(tools).toContain('"name":"read_document"');
      expect(tools).not.toContain('"name":"list_tasks"');

      const listed = parseSseJson(
        (
          await callMcp(
            server,
            token,
            "tools/call",
            { name: "list_documents", arguments: { limit: 1 } },
            2,
          )
        ).body,
      ) as { result?: { content?: Array<{ text?: string }> } };
      expect(listed.result?.content?.[0]?.text).toContain(
        "Found 2 document match(es); returned 1 in this page.",
      );

      const searched = parseSseJson(
        (
          await callMcp(
            server,
            token,
            "tools/call",
            { name: "search_documents", arguments: { query: "deployment", limit: 1 } },
            3,
          )
        ).body,
      ) as { result?: { content?: Array<{ text?: string }> } };
      expect(searched.result?.content?.[0]?.text).toContain(
        "Found 2 document match(es); returned 1 in this page.",
      );

      const read = parseSseJson(
        (
          await callMcp(
            server,
            token,
            "tools/call",
            {
              name: "read_document",
              arguments: { scope: "global", path: "shared/brief.md" },
            },
            4,
          )
        ).body,
      ) as { result?: { structuredContent?: Record<string, unknown> } };
      expect(read.result?.structuredContent).toMatchObject({
        scope: "global",
        relativePath: "shared/brief.md",
        content: "Deployment brief",
      });
      expect(JSON.stringify(read)).not.toContain(testDb.config.paths.workspaceDir);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns an MCP tool error for documents outside granted global folders", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
      await documents.create({ path: "private/secret.md", content: "Secret" });
      const token = apiTokenService.createToken("Public folder", {
        capabilities: ["read_document"],
        templates: [],
        documents: { global: false, globalFolderPaths: ["public"], privateSpecialistIds: [] },
      }).token;

      const response = parseSseJson(
        (
          await callMcp(
            server,
            token,
            "tools/call",
            {
              name: "read_document",
              arguments: { scope: "global", path: "private/secret.md" },
            },
            1,
          )
        ).body,
      ) as { result?: { isError?: boolean } };

      expect(response.result?.isError).toBe(true);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("allows document tools through an explicitly scoped MCP URL token", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
      await documents.create({
        scope: "global",
        path: "shared/brief.md",
        content: "Deployment brief",
      });
      const token = apiTokenService.createToken("Documents", {
        capabilities: ["read_document"],
        templates: [],
        documents: { global: true, globalFolderPaths: [], privateSpecialistIds: [] },
      }).token;

      const read = parseSseJson(
        (
          await callMcpWithUrlToken(
            server,
            token,
            "tools/call",
            {
              name: "read_document",
              arguments: { scope: "global", path: "shared/brief.md" },
            },
            1,
          )
        ).body,
      ) as { result?: { structuredContent?: Record<string, unknown> } };

      expect(read.result?.structuredContent).toMatchObject({
        scope: "global",
        content: "Deployment brief",
      });
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

  it("exercises the read/write tool surface, including not-found paths", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await buildServer(testDb, apiTokenService, taskService);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId, title: "A task", description: "d" });
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "A template",
        description: "d",
      });
      const token = apiTokenService.createToken(
        "All",
        permissionsForPresets("tasks", "templates"),
      ).token;

      let id = 100;
      const call = async (name: string, args: Record<string, unknown>) =>
        parseSseJson(
          (await callMcp(server, token, "tools/call", { name, arguments: args }, id++)).body,
        ) as { result?: { isError?: boolean; structuredContent?: Record<string, unknown> } };
      const isError = (r: Awaited<ReturnType<typeof call>>) => r.result?.isError === true;

      // Read tools — success then not-found.
      expect(isError(await call("list_task_templates", {}))).toBe(false);
      expect(isError(await call("list_specialists", {}))).toBe(false);
      expect(isError(await call("list_tasks", { status: "backlog" }))).toBe(false);
      expect(isError(await call("get_task", { taskId: task.id, expand: "runs,feedback" }))).toBe(
        false,
      );
      expect(isError(await call("get_task", { taskId: "missing" }))).toBe(true);
      expect(isError(await call("list_task_runs", { taskId: task.id }))).toBe(false);
      expect(isError(await call("list_task_runs", { taskId: "missing" }))).toBe(true);
      expect(isError(await call("get_task_run", { taskId: task.id, runId: "missing" }))).toBe(true);
      expect(isError(await call("get_task_result", { runId: "missing" }))).toBe(true);
      expect(isError(await call("list_task_feedback", { taskId: task.id }))).toBe(false);
      expect(isError(await call("list_task_feedback", { taskId: "missing" }))).toBe(true);

      // Write tools — success then not-found.
      expect(isError(await call("enable_task_template", { templateId: template.id }))).toBe(false);
      expect(isError(await call("disable_task_template", { templateId: template.id }))).toBe(false);
      expect(isError(await call("enable_task_template", { templateId: "missing" }))).toBe(true);
      expect(
        isError(await call("create_task", { specialistId: agentId, title: "Made via MCP" })),
      ).toBe(false);
      expect(
        isError(
          await call("schedule_task", { taskId: task.id, runAt: "2099-01-01T00:00:00.000Z" }),
        ),
      ).toBe(false);
      expect(
        isError(
          await call("schedule_task", { taskId: "missing", runAt: "2099-01-01T00:00:00.000Z" }),
        ),
      ).toBe(true);

      // Run tools — the fast not-found paths (no execution).
      expect(isError(await call("task_run", { taskId: "missing" }))).toBe(true);
      expect(isError(await call("task_template_run", { templateId: "missing" }))).toBe(true);

      // Async variants return immediately with the queued run id.
      const asyncRun = await call("task_run_async", { taskId: task.id });
      expect(isError(asyncRun)).toBe(false);
      expect(asyncRun.result?.structuredContent).toMatchObject({ taskId: task.id });
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

async function callMcpWithUrlToken(
  server: InjectServer,
  token: string,
  method: string,
  params: Record<string, unknown>,
  id = 1,
) {
  return server.inject({
    method: "POST",
    url: `/api/public/mcp?key=${encodeURIComponent(token)}`,
    headers: {
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
