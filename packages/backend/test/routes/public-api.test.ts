import { describe, expect, it, vi } from "vitest";

import { agents } from "../../src/db/schema/index";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createConversationService } from "../../src/services/conversation-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskSchedulerService } from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { AppDb } from "../../src/db/client";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type {
  OpenCodeService,
  OpenCodeSession,
  OpenCodeSessionMessage,
} from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function setup() {
  const testDb = await createTestDatabase();
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const opencodeService = createMockOpenCodeService();
  const conversationService = createConversationService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService,
  });
  const taskExecutionService = createTaskExecutionService({ taskService, conversationService });
  const taskSchedulerService = createTaskSchedulerService({
    db: testDb.client.db,
    taskService,
    executionService: taskExecutionService,
  });
  const apiTokenService = createApiTokenService({ db: testDb.client.db });
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    apiTokenService,
    scheduler: createSchedulerService({ delegate: taskSchedulerService }),
    taskService,
    taskExecutionService,
    taskSchedulerService,
  });

  return { testDb, taskService, apiTokenService, taskSchedulerService, server };
}

describe("public task API", () => {
  it("rejects requests without a valid bearer token", async () => {
    const { testDb, server, taskSchedulerService } = await setup();

    try {
      const noToken = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
      });
      const badToken = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
        headers: { authorization: "Bearer cc_not_a_real_token" },
      });

      expect(noToken.statusCode).toBe(401);
      expect(badToken.statusCode).toBe(401);
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("enforces the templates scope on trigger", async () => {
    const { testDb, server, apiTokenService, taskSchedulerService } = await setup();

    try {
      const tasksOnly = apiTokenService.createToken("Tasks only", ["tasks"]).token;
      const forbidden = await server.inject({
        method: "POST",
        url: "/api/public/v1/task-templates/anything/trigger",
        headers: { authorization: `Bearer ${tasksOnly}` },
        payload: {},
      });

      expect(forbidden.statusCode).toBe(403);
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("lists, triggers, schedules, and polls templates with a templates-scoped token", async () => {
    const { testDb, server, apiTokenService, taskSchedulerService } = await setup();

    try {
      const agent = await insertAgent(testDb.client.db);
      const token = apiTokenService.createToken("Templates", ["templates"]).token;
      const auth = { authorization: `Bearer ${token}` };

      const template = await server.inject({
        method: "POST",
        url: "/api/tasks/templates",
        payload: { defaultAgentId: agent.id, title: "Weekly report", description: "Summarise." },
      });
      const templateId = template.json<{ id: string }>().id;

      // List — public-safe shape only.
      const list = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-templates",
        headers: auth,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({
        templates: [{ id: templateId, title: "Weekly report", description: "Summarise." }],
      });
      const listed = list.json<{ templates: Array<Record<string, unknown>> }>().templates[0];
      expect(listed).not.toHaveProperty("defaultAgentId");
      expect(listed).not.toHaveProperty("permissionProfile");

      // Trigger immediately.
      const triggered = await server.inject({
        method: "POST",
        url: `/api/public/v1/task-templates/${templateId}/trigger`,
        headers: auth,
        payload: { context: { text: "Focus on EU." }, metadata: { source: "test" } },
      });
      expect(triggered.statusCode).toBe(200);
      const triggerBody = triggered.json<{
        taskId: string;
        runId: string;
        status: string;
        scheduledFor: string | null;
      }>();
      expect(triggerBody.status).toBe("queued");
      expect(triggerBody.runId).toMatch(/.+/);
      expect(triggerBody.scheduledFor).toBeNull();

      // The created run is tagged as an API run.
      const run = await testDb.client.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, triggerBody.runId),
      });
      expect(run?.trigger_source).toBe("api");

      // Poll the run — public-safe projection, no artifacts/paths.
      const poll = await server.inject({
        method: "GET",
        url: `/api/public/v1/task-runs/${triggerBody.runId}`,
        headers: auth,
      });
      expect(poll.statusCode).toBe(200);
      const pollBody = poll.json<Record<string, unknown>>();
      expect(pollBody).toMatchObject({ runId: triggerBody.runId, taskId: triggerBody.taskId });
      expect(pollBody).not.toHaveProperty("artifacts");
      expect(pollBody).not.toHaveProperty("renderedPrompt");
      expect(pollBody).not.toHaveProperty("effectivePermissions");

      // Schedule for the future — no run is created.
      const scheduled = await server.inject({
        method: "POST",
        url: `/api/public/v1/task-templates/${templateId}/trigger`,
        headers: auth,
        payload: { schedule: { runAt: "2999-01-01T00:00:00.000Z" } },
      });
      expect(scheduled.statusCode).toBe(200);
      expect(scheduled.json()).toMatchObject({
        runId: null,
        status: "scheduled",
        scheduledFor: "2999-01-01T00:00:00.000Z",
      });

      // Past schedule is rejected.
      const pastSchedule = await server.inject({
        method: "POST",
        url: `/api/public/v1/task-templates/${templateId}/trigger`,
        headers: auth,
        payload: { schedule: { runAt: "2000-01-01T00:00:00.000Z" } },
      });
      expect(pastSchedule.statusCode).toBe(400);

      // Unknown template / run → 404.
      const missingTemplate = await server.inject({
        method: "POST",
        url: "/api/public/v1/task-templates/missing/trigger",
        headers: auth,
        payload: {},
      });
      const missingRun = await server.inject({
        method: "GET",
        url: "/api/public/v1/task-runs/missing",
        headers: auth,
      });
      expect(missingTemplate.statusCode).toBe(404);
      expect(missingRun.statusCode).toBe(404);
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function insertAgent(db: AppDb): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${crypto.randomUUID()}`;
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Task Agent",
      role: "help with tasks",
      instructions: "Be useful.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert test agent.");
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
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  const sessions = new Map<string, OpenCodeSession>();
  const messages = new Map<string, OpenCodeSessionMessage[]>();
  let sessionCount = 0;
  let messageCount = 0;
  let time = Date.parse("2026-06-01T12:00:00.000Z");

  function nextTime(): number {
    time += 1_000;
    return time;
  }

  function nextMessageId(): string {
    messageCount += 1;
    return `message-${String(messageCount)}`;
  }

  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    createSession: vi.fn((_directory: string, sessionOptions?: { title?: string }) => {
      sessionCount += 1;
      const session: OpenCodeSession = {
        id: `session-${String(sessionCount)}`,
        title: sessionOptions?.title,
        time: { created: nextTime(), updated: nextTime() },
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return Promise.resolve(session);
    }),
    getSession: vi.fn((_directory: string, sessionID: string) => {
      const session = sessions.get(sessionID);
      if (!session) {
        throw new Error("Session not found.");
      }
      return Promise.resolve(session);
    }),
    listSessionMessages: vi.fn((_directory: string, sessionID: string) =>
      Promise.resolve(messages.get(sessionID) ?? []),
    ),
    promptSession: vi.fn(({ sessionID, text }: { sessionID: string; text: string }) => {
      const session = sessions.get(sessionID);
      const sessionMessages = messages.get(sessionID);
      if (!session || !sessionMessages) {
        throw new Error("Session not found.");
      }
      const assistantMessageId = nextMessageId();
      sessionMessages.push({
        info: {
          id: assistantMessageId,
          sessionID,
          role: "assistant",
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [{ id: `part-${assistantMessageId}`, type: "text", text: `Done: ${text}` }],
      });
      session.time.updated = nextTime();
      return Promise.resolve();
    }),
    promptSessionAsync: vi.fn(),
    abortSession: vi.fn(),
  } as unknown as OpenCodeService;
}
