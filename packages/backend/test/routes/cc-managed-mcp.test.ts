import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { agents, conversations, task_runs } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskService } from "../../src/services/task-service";
import { createSessionArchiveService } from "../../src/services/session-archive-service";
import { createSessionArchiveSettingsService } from "../../src/services/session-archive-settings-service";
import { createCcManagedMcpAuthStateStore } from "../../src/mcp/cc-managed/auth-state-store";
import { createCcManagedMcpAuthTokenService } from "../../src/mcp/cc-managed/auth-token-service";
import type { CcManagedMcpTokenContextMode } from "../../src/mcp/cc-managed/auth-token-service";
import { createTestDatabase } from "../helpers/db";

type InjectServer = Awaited<ReturnType<typeof createServer>>;
type TestConfig = Awaited<ReturnType<typeof createTestDatabase>>["config"];

describe("cc-managed MCP routes", () => {
  it("serves the cc_app MCP endpoint with agent-scoped auth", async () => {
    const testDb = await createTestDatabase();
    testDb.config.server.port = 43123;
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
            appToolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json<{ workspacePath: string }>();
      const config = JSON.parse(
        await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8"),
      ) as {
        mcp: Record<string, { url: string; headers: Record<string, string> }>;
      };
      const ccToolManagement = config.mcp["cc_app"];

      expect(ccToolManagement).toBeDefined();
      expect(ccToolManagement?.url).toContain("/api/mcp/cc/cc-app/specialists/writer");
      expect(ccToolManagement?.headers["Authorization"]).toContain("Bearer ");

      if (!ccToolManagement) {
        throw new Error("Expected cc_app config entry.");
      }

      const authHeader = ccToolManagement.headers["Authorization"];

      if (!authHeader) {
        throw new Error("Expected cc_app authorization header.");
      }

      const initializeResponse = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
      });

      expect(initializeResponse.statusCode).toBe(200);

      const initializeBody = initializeResponse.body;

      expect(initializeResponse.headers["mcp-session-id"]).toBeUndefined();
      expect(initializeBody).toContain('"name":"cc_app"');
      expect(initializeBody).toContain('"listChanged":true');

      const listToolsResponse = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      });

      expect(listToolsResponse.statusCode).toBe(200);
      const listToolsBody = listToolsResponse.body;

      expect(listToolsBody).toContain('"name":"create_custom_tool"');

      const callToolResponse = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "create_custom_tool",
            arguments: {
              name: "Release Helper",
              description: "Draft release notes.",
            },
          },
        },
      });

      expect(callToolResponse.statusCode).toBe(200);
      const callToolJson = parseSseJson(callToolResponse.body) as {
        result?: {
          structuredContent?: {
            toolSlug?: string;
            directoryPath?: string;
            entryPath?: string;
          };
        };
      };

      expect(callToolJson.result?.structuredContent?.toolSlug).toBe("release-helper");
      expect(callToolJson.result?.structuredContent?.directoryPath).toContain(
        "/custom-tools/release-helper",
      );
      expect(callToolJson.result?.structuredContent?.entryPath).toContain(
        "/custom-tools/release-helper/tool.ts",
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects missing bearer auth for cc_app", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.body).toContain("Missing bearer token");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("ignores stale MCP session headers for stateless cc-managed tools", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
            appToolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const tokenService = createCcManagedMcpAuthTokenService({
        authStateStore: createCcManagedMcpAuthStateStore(testDb.config),
      });
      const authHeader = `Bearer ${await tokenService.issueToken("writer", "cc_app")}`;

      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/specialists/writer",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-session-id": "stale-session",
        },
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"name":"create_custom_tool"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves task management tools and creates tasks through MCP", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_tasks_management",
        "task_run",
      );
      const listToolsResponse = await callMcpToolRoute(server, authHeader, "tools/list", {}, 1);

      expect(listToolsResponse.statusCode).toBe(200);
      expect(listToolsResponse.body).toContain('"name":"create_task"');
      expect(listToolsResponse.body).toContain('"name":"queue_task"');
      expect(listToolsResponse.body).not.toContain('"name":"list_specialists"');

      const createTaskResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        {
          name: "create_task",
          arguments: {
            title: "Draft weekly report",
            description: "Summarize project activity.",
            todos: [{ content: "Read notes" }],
          },
        },
        2,
      );

      expect(createTaskResponse.statusCode).toBe(200);
      const createTaskJson = parseSseJson(createTaskResponse.body) as {
        result?: { structuredContent?: { id?: string; title?: string } };
      };

      expect(createTaskJson.result?.structuredContent).toMatchObject({
        title: "Draft weekly report",
      });

      const listed = await taskService.list({ agentId: agent.id });

      expect(listed).toHaveLength(1);
      expect(listed[0]?.title).toBe("Draft weekly report");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts task creation through draft_task", async () => {
    const testDb = await createTestDatabase();
    let reviewedTaskAgentId = "";
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            title: "Reviewed weekly report",
            description: "Reviewed task description.",
            agentId: reviewedTaskAgentId,
            defaultAgentId: "",
            scheduledAt: "",
            dueAt: "",
            contextText: "Reviewed task context.",
          },
        }),
      ),
    };
    const opencodeService = createMockOpenCodeService();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      reviewedTaskAgentId = agent.id;
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_app");
      const createTaskResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-app",
        authHeader,
        "tools/call",
        {
          name: "draft_task",
          arguments: {
            title: "Draft weekly report",
            description: "Summarize project activity.",
          },
        },
        36,
      );

      expect(createTaskResponse.statusCode).toBe(200);
      expect(parseSseJson(createTaskResponse.body)).toMatchObject({
        result: { structuredContent: { title: "Reviewed weekly report" } },
      });
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "task_create_review",
          metadata: expect.objectContaining({ operation: "create_task" }),
        }),
      );

      const listed = await taskService.list({ agentId: agent.id });

      expect(listed[0]).toMatchObject({
        title: "Reviewed weekly report",
        description: "Reviewed task description.",
        context: { text: "Reviewed task context.", attachments: [] },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("queues tasks through task management tools", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Run smoke checks",
        description: "Check critical path.",
        todos: [],
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_tasks_management");
      const queueResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        {
          name: "queue_task",
          arguments: { taskId: task.id },
        },
        3,
      );

      expect(queueResponse.statusCode).toBe(200);
      const queueJson = parseSseJson(queueResponse.body) as {
        result?: { structuredContent?: { taskId?: string; status?: string } };
      };

      expect(queueJson.result?.structuredContent).toMatchObject({
        taskId: task.id,
        status: "queued",
      });
      await expect
        .poll(async () => (await taskService.listRuns(task.id))[0]?.status)
        .toBe("completed");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves every task management tool against the refactored task model", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_tasks_management");
      const task = await taskService.create({
        agentId: agent.id,
        title: "Manual MCP task",
        description: "Run from MCP.",
      });
      const recurring = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Recurring MCP task",
        description: "Keep history.",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });

      const listToolsResponse = await callMcpToolRoute(server, authHeader, "tools/list", {}, 6);

      for (const toolName of [
        "create_task",
        "update_task",
        "list_tasks",
        "get_task",
        "queue_task",
        "schedule_task",
        "list_task_runs",
        "get_task_run",
        "create_task_template",
        "get_task_template",
        "run_task_template_now",
        "enable_task_template",
        "disable_task_template",
      ]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
      }
      // The draft_* tools and task-context tools live in other groups (cc_app and
      // cc_default), and update_task_context no longer exists.
      for (const toolName of [
        "draft_task",
        "draft_task_update",
        "read_task_context",
        "append_task_context",
        "update_task_context",
        "list_specialists",
      ]) {
        expect(listToolsResponse.body).not.toContain(`"name":"${toolName}"`);
      }

      const scheduledResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        {
          name: "schedule_task",
          arguments: {
            taskId: task.id,
            scheduledAt: "2026-06-10T12:00:00.000Z",
          },
        },
        7,
      );
      const listedResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "list_tasks", arguments: { agentId: agent.id } },
        8,
      );
      const getTaskResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "get_task", arguments: { taskId: task.id } },
        9,
      );
      const triggerResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "queue_task", arguments: { taskId: task.id } },
        10,
      );

      const triggerJson = parseSseJson(triggerResponse.body) as {
        result?: { structuredContent?: { id?: string } };
      };
      const runId = triggerJson.result?.structuredContent?.id;

      if (!runId) {
        throw new Error("Expected queue_task to return a run id.");
      }

      const listRunsResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "list_task_runs", arguments: { taskId: task.id } },
        11,
      );
      const getRunResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "get_task_run", arguments: { taskId: task.id, runId } },
        12,
      );

      const createTemplateResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        {
          name: "create_task_template",
          arguments: {
            title: "Created MCP template",
            recurrence: {
              mode: "recurring",
              anchorAt: "2026-06-01T09:00:00.000Z",
              timezone: "UTC",
              repeatRule: { frequency: "day", interval: 1 },
            },
          },
        },
        13,
      );
      const getTemplateResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "get_task_template", arguments: { templateId: recurring.id } },
        14,
      );
      const runTemplateResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "run_task_template_now", arguments: { taskId: recurring.id } },
        15,
      );

      expect(scheduledResponse.statusCode).toBe(200);
      expect(parseSseJson(scheduledResponse.body)).toMatchObject({
        result: {
          structuredContent: { id: task.id, status: "scheduled" },
        },
      });
      expect(parseSseJson(listedResponse.body)).toMatchObject({
        result: { structuredContent: { tasks: expect.any(Array) } },
      });
      expect(parseSseJson(getTaskResponse.body)).toMatchObject({
        result: { structuredContent: { id: task.id, title: "Manual MCP task" } },
      });
      expect(parseSseJson(listRunsResponse.body)).toMatchObject({
        result: { structuredContent: { runs: [expect.objectContaining({ id: runId })] } },
      });
      expect(parseSseJson(getRunResponse.body)).toMatchObject({
        result: { structuredContent: { id: runId, taskId: task.id } },
      });
      expect(parseSseJson(createTemplateResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            title: "Created MCP template",
            defaultAgentId: agent.id,
          },
        },
      });
      expect(parseSseJson(getTemplateResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            id: recurring.id,
            title: "Recurring MCP task",
            defaultAgentId: agent.id,
          },
        },
      });
      const runTemplateJson = parseSseJson(runTemplateResponse.body) as {
        result?: { structuredContent?: { taskId?: string } };
      };
      expect(runTemplateJson).toMatchObject({
        result: { structuredContent: { status: "queued", triggerSource: "agent" } },
      });
      const generatedByManagedTool = await taskService.get(
        runTemplateJson.result?.structuredContent?.taskId ?? "",
      );
      expect(generatedByManagedTool).toMatchObject({
        title: "Recurring MCP task #G1",
        generatedByAgentId: agent.id,
      });

      // Disable the recurring template, then a fresh agent run-now must be refused
      // while the template's settings remain intact.
      const disableResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "disable_task_template", arguments: { templateId: recurring.id } },
        16,
      );
      expect(parseSseJson(disableResponse.body)).toMatchObject({
        result: { structuredContent: { id: recurring.id, enabled: false } },
      });

      const refusedRun = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "run_task_template_now", arguments: { taskId: recurring.id } },
        17,
      );
      expect(parseSseJson(refusedRun.body)).toMatchObject({
        result: { isError: true },
      });

      // The taskId alias is accepted too (matches run_task_template_now's shape).
      const enableResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "enable_task_template", arguments: { taskId: recurring.id } },
        18,
      );
      expect(parseSseJson(enableResponse.body)).toMatchObject({
        result: { structuredContent: { id: recurring.id, enabled: true } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves task context tools from the cc_default group", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Task-run context",
        description: "Task-run tools can edit this context.",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/list",
        {},
        31,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      for (const toolName of ["read_task_context", "append_task_context"]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
      }
      // update_task_context was removed entirely.
      expect(listToolsResponse.body).not.toContain(`"name":"update_task_context"`);

      const appendedContextResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "append_task_context",
          arguments: { taskId: task.id, text: "Observed during task run." },
        },
        32,
      );
      const readContextResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "read_task_context", arguments: { taskId: task.id } },
        33,
      );

      expect(parseSseJson(appendedContextResponse.body)).toMatchObject({
        result: { structuredContent: { text: "Observed during task run.", attachments: [] } },
      });
      expect(parseSseJson(readContextResponse.body)).toMatchObject({
        result: { structuredContent: { text: "Observed during task run.", attachments: [] } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists specialists through cc_default in chat context", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Default Chat Specialist",
          role: "chat with default tools",
          instructions: "Use default tools.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });

      expect(created.statusCode).toBe(201);
      const specialist = created.json<{ slug: string }>();
      const authHeader = await issueAuthHeader(testDb.config, specialist.slug, "cc_default");
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        specialist.slug,
        "cc-default",
        authHeader,
        "tools/list",
        {},
        27,
      );
      const listSpecialistsResponse = await callMcpToolRouteForServer(
        server,
        specialist.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_specialists", arguments: {} },
        28,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      expect(listToolsResponse.body).toContain('"name":"list_specialists"');
      expect(listToolsResponse.body).not.toContain('"name":"set_task_result"');
      const listed = parseSseJson(listSpecialistsResponse.body) as {
        result: { structuredContent: { specialists: Array<Record<string, unknown>> } };
      };
      expect(listed.result.structuredContent.specialists[0]).toEqual({
        id: expect.any(String),
        slug: "default-chat-specialist",
        name: "Default Chat Specialist",
        role: "chat with default tools",
      });
      // The default-tools listing must not leak other specialists' prompts/configuration.
      expect(listSpecialistsResponse.body).not.toContain("instructions");
      expect(listSpecialistsResponse.body).not.toContain("Use default tools.");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists specialists through cc_default in task-run context", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService: createTaskExecutionService({ taskService }),
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/list",
        {},
        29,
      );
      const listSpecialistsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_specialists", arguments: {} },
        30,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      expect(listToolsResponse.body).toContain('"name":"list_specialists"');
      expect(listToolsResponse.body).toContain('"name":"set_task_result"');
      expect(parseSseJson(listSpecialistsResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            specialists: [expect.objectContaining({ slug: "task-agent" })],
          },
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("creates and updates agents through the agent management MCP", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Specialist Manager",
          role: "manage agents",
          instructions: "Maintain specialist workspaces.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_specialist_management", enabled: true, action: "allow" }],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const manager = created.json<{ slug: string }>();
      const authHeader = await issueAuthHeader(
        testDb.config,
        manager.slug,
        "cc_specialist_management",
        "task_run",
      );
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-specialist-management",
        authHeader,
        "tools/list",
        {},
        27,
      );
      const createAgentResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-specialist-management",
        authHeader,
        "tools/call",
        {
          name: "create_specialist",
          arguments: {
            name: "Researcher",
            role: "research context",
            instructions: "Find relevant workspace information.",
            defaultModel: "openai/gpt-4.1",
            capabilities: {},
          },
        },
        28,
      );
      const createJson = parseSseJson(createAgentResponse.body) as {
        result?: { structuredContent?: { id?: string; slug?: string } };
      };
      const researcherId = createJson.result?.structuredContent?.id;

      if (!researcherId) {
        throw new Error("Expected create_specialist to return an agent id.");
      }

      const updateAgentResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-specialist-management",
        authHeader,
        "tools/call",
        {
          name: "update_specialist",
          arguments: {
            id: researcherId,
            input: { role: "research product context" },
          },
        },
        29,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      expect(listToolsResponse.body).toContain('"name":"create_specialist"');
      expect(listToolsResponse.body).toContain('"name":"update_specialist"');
      expect(createJson.result?.structuredContent).toMatchObject({
        slug: "researcher",
      });
      expect(parseSseJson(updateAgentResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            id: researcherId,
            role: "research product context",
          },
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("exposes direct agent tools in task-run and hides draft + removal tools", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Task Run Manager",
          role: "manage agents",
          instructions: "Maintain specialist workspaces.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_specialist_management", enabled: true, action: "allow" }],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const manager = created.json<{ slug: string }>();
      const authHeader = await issueAuthHeader(
        testDb.config,
        manager.slug,
        "cc_specialist_management",
        "task_run",
      );
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-specialist-management",
        authHeader,
        "tools/list",
        {},
        35,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      for (const toolName of [
        "read_specialist_profile",
        "list_models",
        "create_specialist",
        "update_specialist",
      ]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
      }
      for (const toolName of [
        "list_specialists",
        "draft_specialist",
        "draft_specialist_update",
        "remove_specialist",
      ]) {
        expect(listToolsResponse.body).not.toContain(`"name":"${toolName}"`);
      }

      const createResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-specialist-management",
        authHeader,
        "tools/call",
        {
          name: "create_specialist",
          arguments: {
            name: "Task Spawned Specialist",
            role: "spawned in a task",
            instructions: "Do the work.",
            defaultModel: "openai/gpt-4.1",
            capabilities: {},
          },
        },
        36,
      );

      expect(createResponse.statusCode).toBe(200);
      expect(parseSseJson(createResponse.body)).toMatchObject({
        result: { structuredContent: { slug: "task-spawned-specialist" } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reads a full specialist profile through cc_specialist_management", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const target = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Profile Target",
          role: "carry secret instructions",
          instructions: "Confidential profile instructions.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });

      expect(target.statusCode).toBe(201);
      const targetSpecialist = target.json<{ slug: string }>();

      const manager = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Profile Manager",
          role: "manage agents",
          instructions: "Maintain specialist workspaces.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_specialist_management", enabled: true, action: "allow" }],
          },
        },
      });

      expect(manager.statusCode).toBe(201);
      const managerSpecialist = manager.json<{ slug: string }>();
      const authHeader = await issueAuthHeader(
        testDb.config,
        managerSpecialist.slug,
        "cc_specialist_management",
      );

      const profileResponse = await callMcpToolRouteForServer(
        server,
        managerSpecialist.slug,
        "cc-specialist-management",
        authHeader,
        "tools/call",
        { name: "read_specialist_profile", arguments: { specialist: targetSpecialist.slug } },
        38,
      );

      expect(profileResponse.statusCode).toBe(200);
      expect(parseSseJson(profileResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            slug: "profile-target",
            instructions: "Confidential profile instructions.",
            defaultModel: "openai/gpt-4.1",
          },
        },
      });

      const notFoundResponse = await callMcpToolRouteForServer(
        server,
        managerSpecialist.slug,
        "cc-specialist-management",
        authHeader,
        "tools/call",
        { name: "read_specialist_profile", arguments: { specialist: "does-not-exist" } },
        39,
      );

      expect(notFoundResponse.statusCode).toBe(200);
      expect(parseSseJson(notFoundResponse.body)).toMatchObject({
        result: { isError: true },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts agent creation through draft_specialist", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            name: "Reviewed Researcher",
            role: "reviewed research role",
            instructions: "Reviewed research instructions.",
            defaultModel: "openai/gpt-4.1",
            iconPath: "",
            capabilitiesJson: "{}",
          },
        }),
      ),
    };
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Interactive Specialist Manager",
          role: "manage agents",
          instructions: "Maintain specialist workspaces.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const manager = created.json<{ slug: string }>();
      const authHeader = await issueAuthHeader(testDb.config, manager.slug, "cc_app");
      const createAgentResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-app",
        authHeader,
        "tools/call",
        {
          name: "draft_specialist",
          arguments: {
            name: "Draft Researcher",
            role: "draft role",
            instructions: "Draft instructions.",
            defaultModel: "openai/gpt-4.1",
            capabilities: {},
          },
        },
        37,
      );

      expect(createAgentResponse.statusCode).toBe(200);
      expect(parseSseJson(createAgentResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            slug: "reviewed-researcher",
            role: "reviewed research role",
          },
        },
      });
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "specialist_create_review",
          metadata: expect.objectContaining({ operation: "create_specialist" }),
        }),
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts agent updates through draft_specialist_update", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            name: "Reviewed Analyst",
            role: "reviewed analyst role",
            instructions: "Reviewed analyst instructions.",
            defaultModel: "openai/gpt-4.1",
            iconPath: "",
            capabilitiesJson: "{}",
          },
        }),
      ),
    };
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const managerResponse = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Interactive Update Manager",
          role: "manage agents",
          instructions: "Maintain specialist workspaces.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          },
        },
      });
      const targetResponse = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Draft Analyst",
          role: "draft analyst role",
          instructions: "Draft analyst instructions.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });

      expect(managerResponse.statusCode).toBe(201);
      expect(targetResponse.statusCode).toBe(201);
      const manager = managerResponse.json<{ slug: string }>();
      const target = targetResponse.json<{ id: string }>();
      const authHeader = await issueAuthHeader(testDb.config, manager.slug, "cc_app");
      const updateAgentResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-app",
        authHeader,
        "tools/call",
        {
          name: "draft_specialist_update",
          arguments: {
            id: target.id,
            input: { role: "proposed analyst role" },
          },
        },
        38,
      );

      expect(updateAgentResponse.statusCode).toBe(200);
      expect(parseSseJson(updateAgentResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            id: target.id,
            name: "Reviewed Analyst",
            role: "reviewed analyst role",
          },
        },
      });
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "specialist_update_review",
          metadata: expect.objectContaining({ agentId: target.id, operation: "update_specialist" }),
        }),
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("requires confirmation before removing an agent through the agent management MCP", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = {
      create: vi.fn(() => Promise.resolve({ action: "confirm" as const })),
    };
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const managerResponse = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Specialist Remover",
          role: "remove agents",
          instructions: "Archive agents after confirmation.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          },
        },
      });
      const targetResponse = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Archive Target",
          role: "temporary",
          instructions: "Temporary agent.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });

      expect(managerResponse.statusCode).toBe(201);
      expect(targetResponse.statusCode).toBe(201);
      const manager = managerResponse.json<{ slug: string }>();
      const target = targetResponse.json<{ id: string }>();
      const authHeader = await issueAuthHeader(testDb.config, manager.slug, "cc_app");
      const removeResponse = await callMcpToolRouteForServer(
        server,
        manager.slug,
        "cc-app",
        authHeader,
        "tools/call",
        { name: "remove_specialist", arguments: { id: target.id } },
        30,
      );

      expect(removeResponse.statusCode, removeResponse.body).toBe(200);
      const removeJson = parseSseJson(removeResponse.body);

      expect(removeJson, removeResponse.body).toMatchObject({
        result: {
          structuredContent: {
            id: target.id,
            status: "archived",
          },
        },
      });
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "specialist_management_confirmation",
          metadata: expect.objectContaining({ specialistId: target.id }),
        }),
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves cc_default task-run outcome tools", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService: createTaskExecutionService({ taskService }),
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");
      const task = await taskService.create({
        agentId: agent.id,
        title: "Outcome task",
        description: "Capture results.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/list",
        {},
        20,
      );
      const resultResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "set_task_result", arguments: { taskRunId: run.id, resultText: "Done." } },
        21,
      );
      const artifactResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "add_task_artifact",
          arguments: {
            taskRunId: run.id,
            artifact: { title: "Report", type: "file", link: ".cc/artifacts/report.md" },
          },
        },
        22,
      );
      const reviewResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "mark_needs_human_review",
          arguments: { taskRunId: run.id, reason: "Approve before publishing." },
        },
        23,
      );

      expect(listToolsResponse.body).toContain('"name":"set_task_result"');
      expect(listToolsResponse.body).toContain('"name":"add_task_artifact"');
      expect(listToolsResponse.body).toContain('"name":"mark_needs_human_review"');
      expect(parseSseJson(resultResponse.body)).toMatchObject({
        result: { structuredContent: { resultText: "Done." } },
      });
      expect(parseSseJson(artifactResponse.body)).toMatchObject({
        result: { structuredContent: { artifacts: [{ title: "Report" }] } },
      });
      expect(parseSseJson(reviewResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            needsHumanReview: true,
            humanReviewReason: "Approve before publishing.",
          },
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns meaningful cc_default tool errors without output schema failures", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService: createTaskExecutionService({ taskService }),
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");
      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "set_task_result", arguments: { taskRunId: "missing", resultText: "Done." } },
        24,
      );

      expect(response.statusCode).toBe(200);
      const body = parseSseJson(response.body) as {
        result?: {
          isError?: boolean;
          content?: Array<{ type: string; text: string }>;
          structuredContent?: unknown;
        };
      };

      expect(body.result?.isError).toBe(true);
      expect(body.result?.structuredContent).toBeUndefined();
      expect(body.result?.content?.[0]?.text).toContain("Task run not found");
      expect(response.body).not.toContain("Structured content does not match");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reports structured validation errors for task management tools", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService: createTaskExecutionService({ taskService }),
    });

    try {
      const agent = await insertAgentWithTasksManagement(testDb.client.db);
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_tasks_management",
        "task_run",
      );
      const response = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        { name: "create_task", arguments: { description: "Missing title." } },
        4,
      );

      expect(response.statusCode).toBe(200);
      const body = parseSseJson(response.body) as {
        result?: { isError?: boolean; structuredContent?: { error?: { message?: string } } };
      };

      expect(body.result?.isError).toBe(true);
      expect(response.body).toContain("Invalid");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("serves self task tools and creates self-owned tasks through cc_default", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-self-a",
        slug: "self-a",
        name: "Self A",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/list",
        {},
        40,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      for (const toolName of [
        "create_self_task",
        "schedule_self_task",
        "list_self_tasks",
        "get_self_task",
        "list_self_task_runs",
        "get_self_task_run",
        "read_self_task_context",
        "append_self_task_context",
      ]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
      }
      // run_self_task is chat-only (lives in cc_default_interactive).
      expect(listToolsResponse.body).not.toContain('"name":"queue_self_task"');
      expect(listToolsResponse.body).not.toContain('"name":"run_self_task"');

      const createResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "create_self_task",
          arguments: {
            title: "Self-owned task",
            description: "Created by the calling specialist.",
          },
        },
        41,
      );

      expect(createResponse.statusCode).toBe(200);
      const createJson = parseSseJson(createResponse.body) as {
        result?: { structuredContent?: { id?: string; agentId?: string } };
      };

      expect(createJson.result?.structuredContent).toMatchObject({ agentId: agent.id });
      const taskId = createJson.result?.structuredContent?.id;

      if (!taskId) {
        throw new Error("Expected create_self_task to return a task id.");
      }

      const listResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_tasks", arguments: {} },
        42,
      );

      expect(parseSseJson(listResponse.body)).toMatchObject({
        result: { structuredContent: { tasks: [expect.objectContaining({ id: taskId })] } },
      });

      const getResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "get_self_task", arguments: { taskId } },
        43,
      );

      expect(parseSseJson(getResponse.body)).toMatchObject({
        result: { structuredContent: { id: taskId, agentId: agent.id } },
      });

      // The task is now owned by the caller, so it cannot be assigned elsewhere.
      const rejectAgentIdResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "create_self_task",
          arguments: { title: "Reassigned", agentId: "agent-self-a" },
        },
        44,
      );

      expect(parseSseJson(rejectAgentIdResponse.body)).toMatchObject({
        result: { isError: true },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("scopes self task tools to the calling specialist", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-owner",
        slug: "owner",
        name: "Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-intruder",
        slug: "intruder",
        name: "Intruder",
      });
      const ownerTask = await taskService.create({
        agentId: owner.id,
        title: "Owner task",
        description: "Belongs to owner.",
      });
      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default",
        "task_run",
      );

      // The intruder owns no tasks, so list returns an empty set.
      const intruderList = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default",
        intruderAuth,
        "tools/call",
        { name: "list_self_tasks", arguments: {} },
        45,
      );

      expect(parseSseJson(intruderList.body)).toMatchObject({
        result: { structuredContent: { tasks: [] } },
      });

      for (const call of [
        { name: "get_self_task", arguments: { taskId: ownerTask.id } },
        {
          name: "schedule_self_task",
          arguments: { taskId: ownerTask.id, scheduledAt: "2026-06-10T12:00:00.000Z" },
        },
        { name: "read_self_task_context", arguments: { taskId: ownerTask.id } },
        {
          name: "append_self_task_context",
          arguments: { taskId: ownerTask.id, text: "Sneaky note." },
        },
      ]) {
        const response = await callMcpToolRouteForServer(
          server,
          intruder.slug,
          "cc-default",
          intruderAuth,
          "tools/call",
          call,
          46,
        );

        const body = parseSseJson(response.body) as {
          result?: { isError?: boolean; content?: Array<{ text: string }> };
        };

        expect(body.result?.isError, `${call.name} should be rejected`).toBe(true);
        expect(body.result?.content?.[0]?.text).toContain("Task not found");
      }

      // The owner's task was never mutated by the intruder's attempts.
      const reloaded = await taskService.get(ownerTask.id);
      expect(reloaded?.status).toBe(ownerTask.status);
      expect(reloaded?.context.text).toBeUndefined();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("schedules and queues self tasks and lists/reads their runs", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-sched",
        slug: "self-sched",
        name: "Self Sched",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      // Create two tasks: one to schedule, one to queue.
      const schedTask = await taskService.create({
        agentId: agent.id,
        title: "Schedule me",
        description: "Will be scheduled.",
      });
      const queueTask = await taskService.create({
        agentId: agent.id,
        title: "Queue me",
        description: "Will be queued.",
      });

      // schedule_self_task
      const schedResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "schedule_self_task",
          arguments: {
            taskId: schedTask.id,
            scheduledAt: "2026-12-01T09:00:00.000Z",
            dueAt: "2026-12-01T17:00:00.000Z",
          },
        },
        50,
      );

      expect(parseSseJson(schedResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            id: schedTask.id,
            status: "scheduled",
            scheduledAt: "2026-12-01T09:00:00.000Z",
            dueAt: "2026-12-01T17:00:00.000Z",
          },
        },
      });

      // Create a run via the service directly (run_self_task blocks until completion
      // and is tested in its own dedicated test case).
      const queuedRun = await taskService.queueTask({
        taskId: queueTask.id,
        triggerSource: "manual",
      });
      const runId = queuedRun.id;

      // list_self_task_runs
      const listRunsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_runs", arguments: { taskId: queueTask.id } },
        52,
      );

      expect(parseSseJson(listRunsResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            runs: [expect.objectContaining({ id: runId, taskId: queueTask.id })],
          },
        },
      });

      // get_self_task_run
      const getRunResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "get_self_task_run", arguments: { taskId: queueTask.id, runId } },
        53,
      );

      expect(parseSseJson(getRunResponse.body)).toMatchObject({
        result: { structuredContent: { id: runId, taskId: queueTask.id } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects list_self_task_runs and get_self_task_run for another specialist's task", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-runs-owner",
        slug: "runs-owner",
        name: "Runs Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-runs-intruder",
        slug: "runs-intruder",
        name: "Runs Intruder",
      });

      const ownerTask = await taskService.create({
        agentId: owner.id,
        title: "Owner's task with runs",
        description: "Only owner may see runs.",
      });
      const ownerRun = await taskService.queueTask({
        taskId: ownerTask.id,
        triggerSource: "manual",
      });

      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default",
        "task_run",
      );

      const listRunsResponse = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default",
        intruderAuth,
        "tools/call",
        { name: "list_self_task_runs", arguments: { taskId: ownerTask.id } },
        54,
      );

      const listBody = parseSseJson(listRunsResponse.body) as {
        result?: { isError?: boolean; content?: Array<{ text: string }> };
      };

      expect(listBody.result?.isError).toBe(true);
      expect(listBody.result?.content?.[0]?.text).toContain("Task not found");

      const getRunResponse = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default",
        intruderAuth,
        "tools/call",
        { name: "get_self_task_run", arguments: { taskId: ownerTask.id, runId: ownerRun.id } },
        55,
      );

      const getBody = parseSseJson(getRunResponse.body) as {
        result?: { isError?: boolean; content?: Array<{ text: string }> };
      };

      expect(getBody.result?.isError).toBe(true);
      expect(getBody.result?.content?.[0]?.text).toContain("Task not found");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("exposes create_self_task and self context tools only in task-run context", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-self-chat",
        slug: "self-chat",
        name: "Self Chat",
      });
      const chatAuth = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const listToolsResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        chatAuth,
        "tools/list",
        {},
        47,
      );

      expect(listToolsResponse.statusCode).toBe(200);
      // `both`-context self tools are available in chat.
      for (const toolName of [
        "schedule_self_task",
        "list_self_tasks",
        "get_self_task",
        "list_self_task_runs",
        "get_self_task_run",
      ]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
      }
      // task-run-only self tools must not appear in chat.
      for (const toolName of [
        "create_self_task",
        "read_self_task_context",
        "append_self_task_context",
      ]) {
        expect(listToolsResponse.body).not.toContain(`"name":"${toolName}"`);
      }
      // run_self_task is in cc_default_interactive, not cc_default.
      expect(listToolsResponse.body).not.toContain('"name":"run_self_task"');
      expect(listToolsResponse.body).not.toContain('"name":"queue_self_task"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reads and appends self task context with self ownership", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-self-ctx",
        slug: "self-ctx",
        name: "Self Context",
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Context task",
        description: "Holds self context.",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      const appendResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "append_self_task_context",
          arguments: { taskId: task.id, text: "Self observation." },
        },
        48,
      );
      const readResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "read_self_task_context", arguments: { taskId: task.id } },
        49,
      );

      expect(parseSseJson(appendResponse.body)).toMatchObject({
        result: { structuredContent: { text: "Self observation.", attachments: [] } },
      });
      expect(parseSseJson(readResponse.body)).toMatchObject({
        result: { structuredContent: { text: "Self observation.", attachments: [] } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("keeps task management MCP disabled unless the agent enables it", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService: createTaskExecutionService({ taskService }),
    });

    try {
      const [agent] = await testDb.client.db
        .insert(agents)
        .values({
          id: "agent-disabled",
          slug: "disabled-task-tools",
          name: "Disabled Task Tools",
          role: "test",
          instructions: "test",
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
        throw new Error("Failed to create disabled agent.");
      }

      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_tasks_management");
      const response = await callMcpToolRouteForAgent(
        server,
        agent.slug,
        authHeader,
        "tools/list",
        {},
        5,
      );

      expect(response.statusCode).toBe(403);
      expect(response.body).toContain("disabled");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists draft self task tools in chat context and hides them in task-run", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-draft-ctx",
        slug: "draft-ctx",
        name: "Draft Context",
      });

      const chatAuth = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );
      const chatListResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        chatAuth,
        "tools/list",
        {},
        60,
      );

      expect(chatListResponse.statusCode).toBe(200);
      expect(chatListResponse.body).toContain('"name":"draft_self_task"');
      expect(chatListResponse.body).toContain('"name":"draft_self_task_update"');

      const taskRunAuth = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "task_run",
      );
      const taskRunListResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        taskRunAuth,
        "tools/list",
        {},
        61,
      );

      expect(taskRunListResponse.statusCode).toBe(200);
      expect(taskRunListResponse.body).not.toContain('"name":"draft_self_task"');
      expect(taskRunListResponse.body).not.toContain('"name":"draft_self_task_update"');
      // run_self_task is chat-only and must not appear in task_run.
      expect(chatListResponse.body).toContain('"name":"run_self_task"');
      expect(taskRunListResponse.body).not.toContain('"name":"run_self_task"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("run_self_task queues a task and returns the completed run", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-run-wait",
        slug: "run-wait",
        name: "Run Wait",
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Quick background task",
        description: "Should complete fast in test.",
      });
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );

      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        authHeader,
        "tools/call",
        { name: "run_self_task", arguments: { taskId: task.id } },
        67,
      );

      expect(response.statusCode).toBe(200);
      const body = parseSseJson(response.body) as {
        result?: {
          isError?: boolean;
          structuredContent?: { taskId?: string; status?: string; outcome?: string };
        };
      };

      // The tool should have waited until the run completed.
      expect(body.result?.isError).toBeFalsy();
      expect(body.result?.structuredContent).toMatchObject({
        taskId: task.id,
        status: "completed",
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("run_self_task rejects another specialist's task without queuing", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-run-owner",
        slug: "run-owner",
        name: "Run Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-run-intruder2",
        slug: "run-intruder2",
        name: "Run Intruder",
      });

      const ownerTask = await taskService.create({
        agentId: owner.id,
        title: "Owner's task",
        description: "Not yours.",
      });

      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default_interactive",
        "chat",
      );

      const response = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default-interactive",
        intruderAuth,
        "tools/call",
        { name: "run_self_task", arguments: { taskId: ownerTask.id } },
        68,
      );

      const body = parseSseJson(response.body) as {
        result?: { isError?: boolean; content?: Array<{ text: string }> };
      };

      expect(body.result?.isError).toBe(true);
      expect(body.result?.content?.[0]?.text).toContain("Task not found");

      // No run was created for the owner's task.
      const runs = await taskService.listRuns(ownerTask.id);
      expect(runs).toHaveLength(0);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts self task creation via operator review form", async () => {
    const testDb = await createTestDatabase();
    let callerAgentId = "";
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            title: "Reviewed self task",
            description: "Operator-approved description.",
            scheduledAt: "",
            dueAt: "",
            contextText: "Operator context.",
          },
        }),
      ),
    };
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-draft-self",
        slug: "draft-self",
        name: "Draft Self",
      });
      callerAgentId = agent.id;
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );

      const createResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        authHeader,
        "tools/call",
        {
          name: "draft_self_task",
          arguments: {
            title: "Draft self task",
            description: "Pre-filled by specialist.",
          },
        },
        62,
      );

      expect(createResponse.statusCode).toBe(200);
      expect(parseSseJson(createResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            title: "Reviewed self task",
            agentId: callerAgentId,
          },
        },
      });

      // The review form must not have included an agentId field.
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "self_task_create_review",
          metadata: expect.objectContaining({ operation: "create_self_task", callerAgentId }),
        }),
      );
      const callArgs = ((liveRequestService.create.mock.calls as unknown as unknown[][])[0]?.[0] ??
        {}) as { fields?: Array<{ name: string }> };
      const fieldNames = (callArgs?.fields ?? []).map((f: { name: string }) => f.name);
      expect(fieldNames).not.toContain("agentId");
      expect(fieldNames).not.toContain("defaultAgentId");

      // Task was created and belongs to the calling specialist.
      const listed = await taskService.list({ agentId: callerAgentId });
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        title: "Reviewed self task",
        agentId: callerAgentId,
        context: { text: "Operator context.", attachments: [] },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects agentId in draft_self_task input schema", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-draft-strict",
        slug: "draft-strict",
        name: "Draft Strict",
      });
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );

      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        authHeader,
        "tools/call",
        {
          name: "draft_self_task",
          arguments: { title: "Attempt to reassign", agentId: "some-other-agent" },
        },
        63,
      );

      expect(parseSseJson(response.body)).toMatchObject({ result: { isError: true } });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts self task update with full form and refuses another specialist's task", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            title: "Operator-approved title",
            description: "Operator-approved description.",
            scheduledAt: "",
            dueAt: "",
            contextText: "",
          },
        }),
      ),
    };
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-upd-owner",
        slug: "upd-owner",
        name: "Upd Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-upd-intruder",
        slug: "upd-intruder",
        name: "Upd Intruder",
      });

      const ownerTask = await taskService.create({
        agentId: owner.id,
        title: "Original title",
        description: "Original description.",
      });
      const ownerAuth = await issueAuthHeader(
        testDb.config,
        owner.slug,
        "cc_default_interactive",
        "chat",
      );

      // Update with no proposed input shows all fields.
      const updateResponse = await callMcpToolRouteForServer(
        server,
        owner.slug,
        "cc-default-interactive",
        ownerAuth,
        "tools/call",
        { name: "draft_self_task_update", arguments: { taskId: ownerTask.id } },
        64,
      );

      expect(parseSseJson(updateResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            id: ownerTask.id,
            title: "Operator-approved title",
          },
        },
      });

      // Full form must include title, description, scheduledAt, dueAt, contextText.
      const callArgs = ((liveRequestService.create.mock.calls as unknown as unknown[][])[0]?.[0] ??
        {}) as { fields?: Array<{ name: string }> };
      const fieldNames = (callArgs?.fields ?? []).map((f: { name: string }) => f.name);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["title", "description", "scheduledAt", "dueAt", "contextText"]),
      );
      // agentId must never appear in the form.
      expect(fieldNames).not.toContain("agentId");
      expect(fieldNames).not.toContain("defaultAgentId");

      // Intruder cannot update owner's task.
      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default_interactive",
        "chat",
      );
      const intruderResponse = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default-interactive",
        intruderAuth,
        "tools/call",
        { name: "draft_self_task_update", arguments: { taskId: ownerTask.id } },
        65,
      );

      const intruderBody = parseSseJson(intruderResponse.body) as {
        result?: { isError?: boolean; content?: Array<{ text: string }> };
      };
      expect(intruderBody.result?.isError).toBe(true);
      expect(intruderBody.result?.content?.[0]?.text).toContain("Task not found");
      // Live request must not have been opened for the intruder's attempt.
      expect(liveRequestService.create).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("draft_self_task_update only shows changed fields when input is proposed", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            title: "Updated title only",
          },
        }),
      ),
    };
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-partial-upd",
        slug: "partial-upd",
        name: "Partial Upd",
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Original",
        description: "Unchanged.",
      });
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );

      await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        authHeader,
        "tools/call",
        {
          name: "draft_self_task_update",
          arguments: { taskId: task.id, input: { title: "New title proposal" } },
        },
        66,
      );

      // Only the proposed title field should appear in the form.
      const callArgs = ((liveRequestService.create.mock.calls as unknown as unknown[][])[0]?.[0] ??
        {}) as { fields?: Array<{ name: string }> };
      const fieldNames = (callArgs?.fields ?? []).map((f: { name: string }) => f.name);
      expect(fieldNames).toEqual(["title"]);
      expect(fieldNames).not.toContain("description");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists, gets, creates, runs, and instantiates self task templates", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-templates",
        slug: "template-owner",
        name: "Template Owner",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      // create_self_task_template (task_run only)
      const createTemplateResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "create_self_task_template",
          arguments: {
            title: "Daily report template",
            description: "Summarise the day.",
            recurrence: {
              mode: "recurring",
              anchorAt: "2026-06-01T09:00:00.000Z",
              timezone: "UTC",
              repeatRule: { frequency: "day", interval: 1 },
            },
          },
        },
        70,
      );

      const createTemplateJson = parseSseJson(createTemplateResponse.body) as {
        result?: { structuredContent?: { id?: string; title?: string; defaultAgentId?: string } };
      };

      expect(createTemplateJson.result?.structuredContent).toMatchObject({
        title: "Daily report template",
        defaultAgentId: agent.id,
      });
      const templateId = createTemplateJson.result?.structuredContent?.id;

      if (!templateId) throw new Error("Expected template id.");

      // list_self_task_templates
      const listResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_templates", arguments: {} },
        71,
      );

      expect(parseSseJson(listResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            templates: [
              expect.objectContaining({ id: templateId, title: "Daily report template" }),
            ],
          },
        },
      });

      // get_self_task_template
      const getResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "get_self_task_template", arguments: { templateId } },
        72,
      );

      expect(parseSseJson(getResponse.body)).toMatchObject({
        result: { structuredContent: { id: templateId, defaultAgentId: agent.id } },
      });

      // create_self_task_from_template (no run)
      const instantiateResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "create_self_task_from_template", arguments: { templateId } },
        73,
      );

      const instantiateJson = parseSseJson(instantiateResponse.body) as {
        result?: {
          structuredContent?: {
            generatedByAgentId?: string;
            id?: string;
            title?: string;
            status?: string;
          };
        };
      };

      expect(instantiateJson.result?.structuredContent).toMatchObject({
        generatedByAgentId: agent.id,
        title: "Daily report template #G1",
        status: "backlog",
      });

      // run_self_task_template_now (creates a new occurrence and queues it)
      const runNowResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "run_self_task_template_now", arguments: { templateId } },
        74,
      );

      expect(parseSseJson(runNowResponse.body)).toMatchObject({
        result: {
          structuredContent: { status: "queued", triggerSource: "agent" },
        },
      });
      const runNowJson = parseSseJson(runNowResponse.body) as {
        result?: { structuredContent?: { taskId?: string } };
      };
      const runNowTask = await taskService.get(runNowJson.result?.structuredContent?.taskId ?? "");
      expect(runNowTask).toMatchObject({
        generatedByAgentId: agent.id,
        title: "Daily report template #G2",
      });

      // disable_self_task_template flips the status; an agent run-now is then refused.
      const disableResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "disable_self_task_template", arguments: { templateId } },
        75,
      );
      expect(parseSseJson(disableResponse.body)).toMatchObject({
        result: { structuredContent: { id: templateId, enabled: false } },
      });

      const refusedRun = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "run_self_task_template_now", arguments: { templateId } },
        76,
      );
      expect(parseSseJson(refusedRun.body)).toMatchObject({ result: { isError: true } });

      // enable_self_task_template restores it.
      const enableResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "enable_self_task_template", arguments: { templateId } },
        77,
      );
      expect(parseSseJson(enableResponse.body)).toMatchObject({
        result: { structuredContent: { id: templateId, enabled: true } },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("scopes self task template tools to the calling specialist", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-tmpl-owner",
        slug: "tmpl-owner",
        name: "Template Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-tmpl-intruder",
        slug: "tmpl-intruder",
        name: "Template Intruder",
      });

      const ownerTemplate = await taskService.createTemplate({
        defaultAgentId: owner.id,
        title: "Owner's private template",
        description: "Sensitive.",
      });

      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default",
        "task_run",
      );

      // list_self_task_templates for intruder should return zero templates.
      const listResponse = await callMcpToolRouteForServer(
        server,
        intruder.slug,
        "cc-default",
        intruderAuth,
        "tools/call",
        { name: "list_self_task_templates", arguments: {} },
        75,
      );

      expect(parseSseJson(listResponse.body)).toMatchObject({
        result: { structuredContent: { templates: [] } },
      });

      // get, run, instantiate, enable, and disable all return "not found" for the intruder.
      for (const call of [
        { name: "get_self_task_template", arguments: { templateId: ownerTemplate.id } },
        {
          name: "run_self_task_template_now",
          arguments: { templateId: ownerTemplate.id },
        },
        {
          name: "create_self_task_from_template",
          arguments: { templateId: ownerTemplate.id },
        },
        { name: "enable_self_task_template", arguments: { templateId: ownerTemplate.id } },
        { name: "disable_self_task_template", arguments: { templateId: ownerTemplate.id } },
      ]) {
        const response = await callMcpToolRouteForServer(
          server,
          intruder.slug,
          "cc-default",
          intruderAuth,
          "tools/call",
          call,
          76,
        );

        const body = parseSseJson(response.body) as {
          result?: { isError?: boolean; content?: Array<{ text: string }> };
        };

        expect(body.result?.isError, `${call.name} should be rejected`).toBe(true);
        expect(body.result?.content?.[0]?.text).toContain("Task template not found");
      }
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects defaultAgentId in create_self_task_template input", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-tmpl-strict",
        slug: "tmpl-strict",
        name: "Template Strict",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        {
          name: "create_self_task_template",
          arguments: {
            title: "Attempt reassign",
            defaultAgentId: "some-other-agent",
          },
        },
        77,
      );

      expect(parseSseJson(response.body)).toMatchObject({ result: { isError: true } });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("create_self_task_template is hidden in chat context", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-tmpl-ctx",
        slug: "tmpl-ctx",
        name: "Template Ctx",
      });
      const chatAuth = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const taskRunAuth = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default",
        "task_run",
      );

      const chatListResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        chatAuth,
        "tools/list",
        {},
        78,
      );
      const taskRunListResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        taskRunAuth,
        "tools/list",
        {},
        79,
      );

      // create_self_task_template is task_run only.
      expect(chatListResponse.body).not.toContain('"name":"create_self_task_template"');
      expect(taskRunListResponse.body).toContain('"name":"create_self_task_template"');
      // list/get/run/instantiate/enable/disable are both-context.
      for (const toolName of [
        "list_self_task_templates",
        "get_self_task_template",
        "run_self_task_template_now",
        "create_self_task_from_template",
        "enable_self_task_template",
        "disable_self_task_template",
      ]) {
        expect(chatListResponse.body).toContain(`"name":"${toolName}"`);
        expect(taskRunListResponse.body).toContain(`"name":"${toolName}"`);
      }
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("drafts self task template creation via operator review form", async () => {
    const testDb = await createTestDatabase();
    let callerAgentId = "";
    const liveRequestService = {
      create: vi.fn(() =>
        Promise.resolve({
          action: "submit" as const,
          values: {
            title: "Reviewed template title",
            description: "Operator-approved description.",
          },
        }),
      ),
    };
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      liveRequestService: liveRequestService as never,
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-draft-tmpl",
        slug: "draft-tmpl",
        name: "Draft Template",
      });
      callerAgentId = agent.id;
      const authHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default_interactive",
        "chat",
      );

      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default-interactive",
        authHeader,
        "tools/call",
        {
          name: "draft_self_task_template",
          arguments: {
            title: "Pre-filled title",
            recurrence: {
              mode: "recurring",
              anchorAt: "2026-06-01T09:00:00.000Z",
              timezone: "UTC",
              repeatRule: { frequency: "week", interval: 1 },
            },
          },
        },
        80,
      );

      expect(parseSseJson(response.body)).toMatchObject({
        result: {
          structuredContent: {
            title: "Reviewed template title",
            defaultAgentId: callerAgentId,
          },
        },
      });

      // Verify recurrence passed in args was preserved (not lost through the form).
      const created = await taskService.listTemplates();
      expect(created[0]?.recurrence).toMatchObject({ repeatRule: { frequency: "week" } });

      // Review form must not include defaultAgentId.
      expect(liveRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "self_task_template_create_review",
          metadata: expect.objectContaining({
            operation: "create_self_task_template",
            callerAgentId,
          }),
        }),
      );
      const callArgs = ((liveRequestService.create.mock.calls as unknown as unknown[][])[0]?.[0] ??
        {}) as { fields?: Array<{ name: string }> };
      const fieldNames = (callArgs?.fields ?? []).map((f: { name: string }) => f.name);
      expect(fieldNames).not.toContain("defaultAgentId");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists self task artifacts across runs and per-run", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-artifacts",
        slug: "artifact-owner",
        name: "Artifact Owner",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      const task = await taskService.create({
        agentId: agent.id,
        title: "Artifact task",
        description: "Produces artifacts.",
      });

      // Create a run and add an artifact to it.
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Run it.",
      });
      await taskService.addRunArtifact(run.id, agent.id, {
        title: "Report",
        description: "Weekly summary.",
        type: "file",
        link: ".cc/artifacts/report.md",
      });

      // list_self_task_artifacts: aggregates across all runs
      const listAllResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_artifacts", arguments: { taskId: task.id } },
        90,
      );

      expect(parseSseJson(listAllResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            taskId: task.id,
            artifacts: [
              expect.objectContaining({
                title: "Report",
                type: "file",
                link: ".cc/artifacts/report.md",
                sourceRunId: run.id,
              }),
            ],
          },
        },
      });

      // list_self_task_run_artifacts: artifacts for one specific run
      const listRunResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_run_artifacts", arguments: { taskId: task.id, runId: run.id } },
        91,
      );

      expect(parseSseJson(listRunResponse.body)).toMatchObject({
        result: {
          structuredContent: {
            taskId: task.id,
            runId: run.id,
            artifacts: [expect.objectContaining({ title: "Report", sourceRunId: run.id })],
          },
        },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns empty artifact lists without error", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-no-artifacts",
        slug: "no-artifacts",
        name: "No Artifacts",
      });
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");

      const task = await taskService.create({
        agentId: agent.id,
        title: "Empty artifact task",
        description: "No runs yet.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Run it.",
      });

      // No artifacts added. Both tools should return empty arrays cleanly.
      const listAllResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_artifacts", arguments: { taskId: task.id } },
        92,
      );
      const listRunResponse = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        authHeader,
        "tools/call",
        { name: "list_self_task_run_artifacts", arguments: { taskId: task.id, runId: run.id } },
        93,
      );

      const allBody = parseSseJson(listAllResponse.body) as {
        result?: { isError?: boolean; structuredContent?: { artifacts?: unknown[] } };
      };
      expect(allBody.result?.isError).toBeFalsy();
      expect(allBody.result?.structuredContent?.artifacts).toEqual([]);

      const runBody = parseSseJson(listRunResponse.body) as {
        result?: { isError?: boolean; structuredContent?: { artifacts?: unknown[] } };
      };
      expect(runBody.result?.isError).toBeFalsy();
      expect(runBody.result?.structuredContent?.artifacts).toEqual([]);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("blocks artifact access for tasks owned by another specialist", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      taskService,
      taskExecutionService,
    });

    try {
      const owner = await insertActiveAgent(testDb.client.db, {
        id: "agent-art-owner",
        slug: "art-owner",
        name: "Art Owner",
      });
      const intruder = await insertActiveAgent(testDb.client.db, {
        id: "agent-art-intruder",
        slug: "art-intruder",
        name: "Art Intruder",
      });

      const ownerTask = await taskService.create({
        agentId: owner.id,
        title: "Owner's artifact task",
        description: "Has artifacts.",
      });
      const ownerRun = await taskService.createRun({
        taskId: ownerTask.id,
        agentId: owner.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do it.",
      });
      await taskService.addRunArtifact(ownerRun.id, owner.id, {
        title: "Secret report",
        type: "file",
        link: ".cc/artifacts/secret.md",
      });

      const intruderAuth = await issueAuthHeader(
        testDb.config,
        intruder.slug,
        "cc_default",
        "task_run",
      );

      for (const call of [
        { name: "list_self_task_artifacts", arguments: { taskId: ownerTask.id } },
        {
          name: "list_self_task_run_artifacts",
          arguments: { taskId: ownerTask.id, runId: ownerRun.id },
        },
      ]) {
        const response = await callMcpToolRouteForServer(
          server,
          intruder.slug,
          "cc-default",
          intruderAuth,
          "tools/call",
          call,
          94,
        );

        const body = parseSseJson(response.body) as {
          result?: { isError?: boolean; content?: Array<{ text: string }> };
        };

        expect(body.result?.isError, `${call.name} should be rejected`).toBe(true);
        expect(body.result?.content?.[0]?.text).toContain("Task not found");
      }
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("get_self_profile returns the calling specialist's own profile in chat and task-run", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      // Create two specialists to confirm the tool only returns the caller's own data.
      const created = await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Profile Specialist",
          role: "inspect own profile",
          instructions: "Read my own profile.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });
      await server.inject({
        method: "POST",
        url: "/api/specialists",
        payload: {
          name: "Other Specialist",
          role: "other role",
          instructions: "Different specialist.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {},
        },
      });

      expect(created.statusCode).toBe(201);
      const specialist = created.json<{ slug: string; id: string }>();

      for (const contextMode of ["chat", "task_run"] as const) {
        const authHeader = await issueAuthHeader(
          testDb.config,
          specialist.slug,
          "cc_default",
          contextMode,
        );
        const response = await callMcpToolRouteForServer(
          server,
          specialist.slug,
          "cc-default",
          authHeader,
          "tools/call",
          { name: "get_self_profile", arguments: {} },
          95,
        );

        expect(response.statusCode).toBe(200);
        const body = parseSseJson(response.body) as {
          result?: {
            isError?: boolean;
            structuredContent?: {
              id?: string;
              slug?: string;
              name?: string;
              role?: string;
              capabilities?: unknown;
            };
          };
        };

        expect(body.result?.isError).toBeFalsy();
        expect(body.result?.structuredContent).toMatchObject({
          id: specialist.id,
          slug: "profile-specialist",
          name: "Profile Specialist",
          role: "inspect own profile",
        });
        // Capabilities must be present (verifies the field is included).
        expect(body.result?.structuredContent?.capabilities).toBeDefined();
        // Must not return the other specialist's data.
        expect(JSON.stringify(body.result?.structuredContent)).not.toContain("Other Specialist");
      }
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("get_self_profile returns a clear error for an unknown specialist slug", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      // Issue a token for a slug that was never created.
      const authHeader = await issueAuthHeader(testDb.config, "ghost-specialist", "cc_default");
      const response = await callMcpToolRouteForServer(
        server,
        "ghost-specialist",
        "cc-default",
        authHeader,
        "tools/call",
        { name: "get_self_profile", arguments: {} },
        96,
      );

      // Unknown slugs are rejected at the route layer before the tool executes.
      expect(response.statusCode).toBe(404);
      expect(response.body).toContain("ghost-specialist");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("exposes self-conversation tools and lists only the caller's sessions", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-self-conv",
        slug: "self-conv",
        name: "Self Conversation Specialist",
      });
      const other = await insertActiveAgent(testDb.client.db, {
        id: "agent-other",
        slug: "other",
        name: "Other Specialist",
      });
      for (let index = 0; index < 12; index += 1) {
        await insertConversation(testDb.client.db, {
          id: `conv-${String(index)}`,
          agentId: agent.id,
          updatedAt: new Date(1_700_000_000_000 + index * 1_000),
        });
      }
      await insertConversation(testDb.client.db, { id: "conv-other", agentId: other.id });

      const chatHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const list = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        chatHeader,
        "tools/list",
        {},
        1,
      );
      expect(list.body).toContain('"name":"list_self_conversations"');
      expect(list.body).toContain('"name":"get_self_conversation"');

      const taskRunHeader = await issueAuthHeader(
        testDb.config,
        agent.slug,
        "cc_default",
        "task_run",
      );
      const taskRunList = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        taskRunHeader,
        "tools/list",
        {},
        2,
      );
      expect(taskRunList.body).toContain('"name":"get_self_conversation"');

      const called = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        chatHeader,
        "tools/call",
        { name: "list_self_conversations", arguments: {} },
        3,
      );
      const result = parseSseJson(called.body) as {
        result?: { structuredContent?: { conversations?: Array<{ id: string }> } };
      };
      const listed = result.result?.structuredContent?.conversations ?? [];
      expect(listed).toHaveLength(10);
      expect(listed[0]?.id).toBe("conv-11");
      expect(listed.some((entry) => entry.id === "conv-other")).toBe(false);
      // List output must not leak archive folder paths.
      expect(called.body).not.toContain('"path"');
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns the archive folder path for an owned conversation and refuses others", async () => {
    const testDb = await createTestDatabase();
    const archiveService = createSessionArchiveService({ config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      sessionArchiveService: archiveService,
      sessionArchiveSettingsService: createSessionArchiveSettingsService({ config: testDb.config }),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-archive",
        slug: "archive-self",
        name: "Archive Specialist",
      });
      const other = await insertActiveAgent(testDb.client.db, {
        id: "agent-archive-other",
        slug: "archive-other",
        name: "Other",
      });
      await insertConversation(testDb.client.db, { id: "conv-owned", agentId: agent.id });
      await insertConversation(testDb.client.db, { id: "conv-foreign", agentId: other.id });

      const header = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");

      const owned = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "get_self_conversation", arguments: { conversationId: "conv-owned" } },
        1,
      );
      const ownedResult = parseSseJson(owned.body) as {
        result?: { structuredContent?: { archive?: { enabled?: boolean; path?: string } } };
      };
      expect(ownedResult.result?.structuredContent?.archive?.enabled).toBe(true);
      expect(ownedResult.result?.structuredContent?.archive?.path).toContain(
        "sessions/specialists/agent-archive/chats/conv-owned",
      );

      const foreign = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "get_self_conversation", arguments: { conversationId: "conv-foreign" } },
        2,
      );
      const foreignResult = parseSseJson(foreign.body) as {
        result?: { isError?: boolean; structuredContent?: { error?: { message?: string } } };
      };
      expect(foreignResult.result?.isError).toBe(true);
      expect(foreignResult.result?.structuredContent?.error?.message).toContain("not found");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reports stale transcript metadata and materializes on demand", async () => {
    const testDb = await createTestDatabase();
    const archiveService = createSessionArchiveService({ config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      sessionArchiveService: archiveService,
      sessionArchiveSettingsService: createSessionArchiveSettingsService({ config: testDb.config }),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-stale",
        slug: "stale-self",
        name: "Stale Specialist",
      });
      await insertConversation(testDb.client.db, { id: "conv-stale", agentId: agent.id });

      const archivePath = archiveService.resolveChatArchivePath({
        agentId: agent.id,
        conversationId: "conv-stale",
      });
      await archiveService.ensureChatArchive({
        specialist: { id: agent.id, slug: agent.slug, name: agent.name },
        conversationId: "conv-stale",
        opencodeSessionId: "oc-conv-stale",
      });
      await archiveService.appendMessages({
        archivePath,
        messages: [
          {
            id: "m1",
            conversationId: "conv-stale",
            role: "user",
            content: "hi",
            parts: [],
            attachments: [],
            createdAt: "2026-06-18T10:00:00.000Z",
            updatedAt: "2026-06-18T10:00:00.000Z",
          },
        ],
      });

      const header = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const stale = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "get_self_conversation", arguments: { conversationId: "conv-stale" } },
        1,
      );
      const staleResult = parseSseJson(stale.body) as {
        result?: { structuredContent?: { archive?: { isTranscriptStale?: boolean } } };
      };
      expect(staleResult.result?.structuredContent?.archive?.isTranscriptStale).toBe(true);

      const refreshed = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        {
          name: "get_self_conversation",
          arguments: { conversationId: "conv-stale", materialize: true },
        },
        2,
      );
      const refreshedResult = parseSseJson(refreshed.body) as {
        result?: {
          structuredContent?: {
            archive?: { isTranscriptStale?: boolean; lastMaterializedMessageCount?: number };
          };
        };
      };
      expect(refreshedResult.result?.structuredContent?.archive?.isTranscriptStale).toBe(false);
      expect(refreshedResult.result?.structuredContent?.archive?.lastMaterializedMessageCount).toBe(
        1,
      );
      await expect(readFile(join(archivePath, "transcript.md"), "utf8")).resolves.toContain(
        "# Session:",
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("reports archive disabled when no archive service is wired", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-disabled",
        slug: "disabled-self",
        name: "Disabled Specialist",
      });
      await insertConversation(testDb.client.db, { id: "conv-disabled", agentId: agent.id });

      const header = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "get_self_conversation", arguments: { conversationId: "conv-disabled" } },
        1,
      );
      const result = parseSseJson(response.body) as {
        result?: { structuredContent?: { archive?: { enabled?: boolean } } };
      };
      expect(result.result?.structuredContent?.archive?.enabled).toBe(false);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("caps list_self_conversations at 50 when a larger limit is requested", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-limit-clamp",
        slug: "limit-clamp",
        name: "Limit Clamp Specialist",
      });
      for (let index = 0; index < 52; index += 1) {
        await insertConversation(testDb.client.db, {
          id: `conv-lc-${String(index)}`,
          agentId: agent.id,
        });
      }

      const header = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "chat");
      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "list_self_conversations", arguments: { limit: 100 } },
        1,
      );
      const result = parseSseJson(response.body) as {
        result?: { structuredContent?: { conversations?: unknown[] } };
      };
      expect(result.result?.structuredContent?.conversations).toHaveLength(50);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns the task-run archive folder path for an owned task-run conversation", async () => {
    const testDb = await createTestDatabase();
    const archiveService = createSessionArchiveService({ config: testDb.config });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
      sessionArchiveService: archiveService,
      sessionArchiveSettingsService: createSessionArchiveSettingsService({ config: testDb.config }),
    });

    try {
      const agent = await insertActiveAgent(testDb.client.db, {
        id: "agent-taskrun-path",
        slug: "taskrun-path",
        name: "Task Run Path Specialist",
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Archive task run",
        description: "Test task for archive path.",
      });
      const runId = "run-test-y";
      await testDb.client.db.insert(task_runs).values({
        id: runId,
        task_id: task.id,
        agent_id: agent.id,
        status: "completed",
        trigger_source: "manual",
        rendered_prompt: "",
        created_at: new Date(),
        updated_at: new Date(),
      });
      await insertConversation(testDb.client.db, {
        id: "conv-taskrun-path",
        agentId: agent.id,
        source: "task_run",
        taskId: task.id,
        taskRunId: runId,
      });

      const header = await issueAuthHeader(testDb.config, agent.slug, "cc_default", "task_run");
      const response = await callMcpToolRouteForServer(
        server,
        agent.slug,
        "cc-default",
        header,
        "tools/call",
        { name: "get_self_conversation", arguments: { conversationId: "conv-taskrun-path" } },
        1,
      );
      const result = parseSseJson(response.body) as {
        result?: { structuredContent?: { archive?: { enabled?: boolean; path?: string } } };
      };
      expect(result.result?.structuredContent?.archive?.enabled).toBe(true);
      expect(result.result?.structuredContent?.archive?.path).toContain(
        `sessions/specialists/agent-taskrun-path/tasks/${task.id}/runs/${runId}`,
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

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

async function callMcpToolRoute(
  server: InjectServer,
  authHeader: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
) {
  return callMcpToolRouteForAgent(server, "task-agent", authHeader, method, params, id);
}

async function callMcpToolRouteForAgent(
  server: InjectServer,
  specialistSlug: string,
  authHeader: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
) {
  return callMcpToolRouteForServer(
    server,
    specialistSlug,
    "cc-tasks-management",
    authHeader,
    method,
    params,
    id,
  );
}

async function callMcpToolRouteForServer(
  server: InjectServer,
  specialistSlug: string,
  routeSegment: string,
  authHeader: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
) {
  return server.inject({
    method: "POST",
    url: `/api/mcp/cc/${routeSegment}/specialists/${specialistSlug}`,
    headers: {
      Authorization: authHeader,
      Accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    payload: {
      jsonrpc: "2.0",
      id,
      method,
      params,
    },
  });
}

async function issueAuthHeader(
  config: TestConfig,
  specialistSlug: string,
  serverName: string,
  contextMode?: CcManagedMcpTokenContextMode,
): Promise<string> {
  const tokenService = createCcManagedMcpAuthTokenService({
    authStateStore: createCcManagedMcpAuthStateStore(config),
  });
  return `Bearer ${await tokenService.issueToken(specialistSlug, serverName, contextMode)}`;
}

async function insertAgentWithTasksManagement(db: AppDb) {
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-task-management",
      slug: "task-agent",
      name: "Task Specialist",
      role: "manage tasks",
      instructions: "Manage task lifecycle.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify({
        appMcpServers: [
          { name: "cc_tasks_management", enabled: true, action: "allow" },
          { name: "cc_app", enabled: true, action: "allow" },
        ],
        appToolPermissions: [],
      }),
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert task management agent.");
  }

  return agent;
}

async function insertConversation(
  db: AppDb,
  input: {
    id: string;
    agentId: string;
    source?: "chat" | "task_run";
    taskId?: string;
    taskRunId?: string;
    title?: string;
    updatedAt?: Date;
  },
) {
  const timestamp = input.updatedAt ?? new Date();
  await db.insert(conversations).values({
    id: input.id,
    agent_id: input.agentId,
    opencode_session_id: `oc-${input.id}`,
    title: input.title ?? null,
    status: "active",
    source: input.source ?? "chat",
    is_current: false,
    task_id: input.taskId ?? null,
    task_run_id: input.taskRunId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    converted_at: null,
  });
}

async function insertActiveAgent(db: AppDb, input: { id: string; slug: string; name: string }) {
  const [agent] = await db
    .insert(agents)
    .values({
      id: input.id,
      slug: input.slug,
      name: input.name,
      role: "self tools",
      instructions: "Manage own tasks.",
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
    throw new Error("Failed to insert active agent.");
  }

  return agent;
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
  const now = Date.now();

  return {
    dispose: () => Promise.resolve(),
    disposeGlobal: () => Promise.resolve(),
    createSession: () =>
      Promise.resolve({
        id: "session-1",
        title: "Chat",
        time: { created: now, updated: now },
      }),
    getSession: () =>
      Promise.resolve({
        id: "session-1",
        title: "Chat",
        time: { created: now, updated: now },
      }),
    listSessionMessages: () => Promise.resolve([]),
    listProviders: () => Promise.resolve({ all: [], default: {}, connected: [] }),
    listAuthMethods: () => Promise.resolve({}),
    setApiKey: () => Promise.resolve(true),
    startOauth: () =>
      Promise.resolve({
        url: "https://example.com",
        method: "auto",
        instructions: "",
      }),
    completeOauth: () => Promise.resolve(true),
    disconnectProvider: () => Promise.resolve(true),
  } as unknown as OpenCodeService;
}
