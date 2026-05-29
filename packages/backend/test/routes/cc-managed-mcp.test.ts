import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { agents } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskService } from "../../src/services/task-service";
import { createCcManagedMcpAuthStateStore } from "../../src/mcp/cc-managed/auth-state-store";
import { createCcManagedMcpAuthTokenService } from "../../src/mcp/cc-managed/auth-token-service";
import { createTestDatabase } from "../helpers/db";

type InjectServer = Awaited<ReturnType<typeof createServer>>;
type TestConfig = Awaited<ReturnType<typeof createTestDatabase>>["config"];

describe("cc-managed MCP routes", () => {
  it("serves the cc_tool_management MCP endpoint with agent-scoped auth", async () => {
    const testDb = await createTestDatabase();
    testDb.config.server.port = 43123;
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/agents",
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
            appMcpServers: [{ name: "cc_tool_management", enabled: true, action: "allow" }],
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
      const ccToolManagement = config.mcp["cc_tool_management"];

      expect(ccToolManagement).toBeDefined();
      expect(ccToolManagement?.url).toContain("/api/mcp/cc/cc-tool-management/agents/writer");
      expect(ccToolManagement?.headers["Authorization"]).toContain("Bearer ");

      if (!ccToolManagement) {
        throw new Error("Expected cc_tool_management config entry.");
      }

      const authHeader = ccToolManagement.headers["Authorization"];

      if (!authHeader) {
        throw new Error("Expected cc_tool_management authorization header.");
      }

      const initializeResponse = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-tool-management/agents/writer",
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
      expect(initializeBody).toContain('"name":"cc_tool_management"');
      expect(initializeBody).toContain('"listChanged":true');

      const listToolsResponse = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-tool-management/agents/writer",
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
        url: "/api/mcp/cc/cc-tool-management/agents/writer",
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

  it("rejects missing bearer auth for cc_tool_management", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-tool-management/agents/writer",
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
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/agents",
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
            appMcpServers: [{ name: "cc_tool_management", enabled: true, action: "allow" }],
            appToolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const tokenService = createCcManagedMcpAuthTokenService({
        authStateStore: createCcManagedMcpAuthStateStore(testDb.config),
      });
      const authHeader = `Bearer ${await tokenService.issueToken("writer", "cc_tool_management")}`;

      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-tool-management/agents/writer",
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
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_tasks_management");
      const listToolsResponse = await callMcpToolRoute(server, authHeader, "tools/list", {}, 1);

      expect(listToolsResponse.statusCode).toBe(200);
      expect(listToolsResponse.body).toContain('"name":"create_task"');
      expect(listToolsResponse.body).toContain('"name":"queue_task"');

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
        result?: { structuredContent?: { id?: string; title?: string; triggerMode?: string } };
      };

      expect(createTaskJson.result?.structuredContent).toMatchObject({
        title: "Draft weekly report",
        triggerMode: "manual",
      });

      const listed = await taskService.list({ agentId: agent.id });

      expect(listed).toHaveLength(1);
      expect(listed[0]?.title).toBe("Draft weekly report");
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
        triggerMode: "manual",
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
        triggerMode: "manual",
      });
      const recurring = await taskService.create({
        agentId: agent.id,
        title: "Recurring MCP task",
        description: "Keep history.",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });

      const listToolsResponse = await callMcpToolRoute(server, authHeader, "tools/list", {}, 6);

      for (const toolName of [
        "create_task",
        "list_tasks",
        "get_task",
        "queue_task",
        "schedule_task",
        "add_task_comment",
        "list_task_runs",
        "get_task_run",
        "create_task_template",
        "run_task_template_now",
        "read_task_context",
        "append_task_context",
        "update_task_context",
      ]) {
        expect(listToolsResponse.body).toContain(`"name":"${toolName}"`);
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
      const commentResponse = await callMcpToolRoute(
        server,
        authHeader,
        "tools/call",
        {
          name: "add_task_comment",
          arguments: {
            taskId: task.id,
            body: "Review before accepting.",
          },
        },
        14,
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
      expect(parseSseJson(commentResponse.body)).toMatchObject({
        result: { structuredContent: { body: "Review before accepting.", status: "open" } },
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
      expect(parseSseJson(runTemplateResponse.body)).toMatchObject({
        result: { structuredContent: { status: "queued", triggerSource: "template" } },
      });
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
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default");
      const task = await taskService.create({
        agentId: agent.id,
        title: "Outcome task",
        description: "Capture results.",
        triggerMode: "manual",
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
            artifact: { title: "Report", path: ".cc/artifacts/report.md" },
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
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_default");
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
      const authHeader = await issueAuthHeader(testDb.config, agent.slug, "cc_tasks_management");
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

  it("keeps task management MCP disabled unless the agent enables it", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
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
  agentSlug: string,
  authHeader: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
) {
  return callMcpToolRouteForServer(
    server,
    agentSlug,
    "cc-tasks-management",
    authHeader,
    method,
    params,
    id,
  );
}

async function callMcpToolRouteForServer(
  server: InjectServer,
  agentSlug: string,
  routeSegment: string,
  authHeader: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
) {
  return server.inject({
    method: "POST",
    url: `/api/mcp/cc/${routeSegment}/agents/${agentSlug}`,
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
  agentSlug: string,
  serverName: string,
): Promise<string> {
  const tokenService = createCcManagedMcpAuthTokenService({
    authStateStore: createCcManagedMcpAuthStateStore(config),
  });
  return `Bearer ${await tokenService.issueToken(agentSlug, serverName)}`;
}

async function insertAgentWithTasksManagement(db: AppDb) {
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-task-management",
      slug: "task-agent",
      name: "Task Agent",
      role: "manage tasks",
      instructions: "Manage task lifecycle.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify({
        appMcpServers: [{ name: "cc_tasks_management", enabled: true, action: "allow" }],
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
