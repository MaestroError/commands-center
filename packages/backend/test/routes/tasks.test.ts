import { describe, expect, it, vi } from "vitest";

import { agents } from "../../src/db/schema/index";
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

describe("task routes", () => {
  it("supports task lifecycle and run history endpoints", async () => {
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
    const server = createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService({ delegate: taskSchedulerService }),
      taskService,
      taskExecutionService,
      taskSchedulerService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const created = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          agentId: agent.id,
          title: "Ship release",
          description: "Prepare the release.",
          todos: [{ content: "Read changelog" }],
          triggerMode: "manual",
        },
      });

      expect(created.statusCode).toBe(201);
      const task = created.json<{ id: string }>();

      const listed = await server.inject({ method: "GET", url: "/api/tasks" });
      const fetched = await server.inject({ method: "GET", url: `/api/tasks/${task.id}` });
      const updated = await server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        payload: { title: "Ship stable release", status: "completed" },
      });
      const disabled = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/disable`,
      });
      const enabled = await server.inject({ method: "POST", url: `/api/tasks/${task.id}/enable` });
      const archived = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/archive`,
      });
      const restored = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/restore`,
      });
      const triggered = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/trigger`,
        payload: { triggerSource: "manual", context: { text: "Use current changelog." } },
      });
      const runs = await server.inject({ method: "GET", url: `/api/tasks/${task.id}/runs` });
      const runId = triggered.json<{ id: string }>().id;
      const schedulerState = await server.inject({
        method: "GET",
        url: "/api/tasks/scheduler/state",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);
      expect(fetched.statusCode).toBe(200);
      expect(updated.statusCode).toBe(200);
      expect(updated.json().status).toBe("completed");
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().status).toBe("disabled");
      expect(enabled.statusCode).toBe(200);
      expect(archived.statusCode).toBe(200);
      expect(archived.json().status).toBe("archived");
      expect(restored.statusCode).toBe(200);
      expect(restored.json().archived).toBe(false);
      expect(runs.statusCode).toBe(200);
      expect(runs.json()).toHaveLength(1);
      expect(triggered.statusCode).toBe(200);
      expect(triggered.json().status).toBe("queued");
      expect(triggered.json().context).toEqual({ text: "Use current changelog." });
      await expect
        .poll(async () => {
          const response = await server.inject({
            method: "GET",
            url: `/api/tasks/${task.id}/runs/${String(runId)}`,
          });
          return response.json<{ status?: string }>().status;
        })
        .toBe("completed");
      const session = await server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/runs/${String(runId)}/session`,
      });
      const openInChat = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/runs/${String(runId)}/open-in-chat`,
      });
      const activeRuns = await server.inject({ method: "GET", url: "/api/tasks/runs/active" });
      expect(session.statusCode).toBe(200);
      expect(session.json().conversation.source).toBe("task_run");
      expect(openInChat.statusCode).toBe(200);
      expect(openInChat.json().current.source).toBe("chat");
      expect(activeRuns.statusCode).toBe(200);
      expect(activeRuns.json()).toEqual([]);
      expect(schedulerState.statusCode).toBe(200);
      const deleted = await server.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
      const afterDelete = await server.inject({ method: "GET", url: `/api/tasks/${task.id}` });

      expect(deleted.statusCode).toBe(204);
      expect(afterDelete.statusCode).toBe(404);
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns validation failures and max limit conflicts", async () => {
    const testDb = await createTestDatabase();
    const config = { ...testDb.config, tasks: { maxTasks: 1 } };
    const taskService = createTaskService({ db: testDb.client.db, config });
    const taskExecutionService = createTaskExecutionService({ taskService });
    const taskSchedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService: taskExecutionService,
    });
    const server = createServer({
      config,
      logger: createLogger(config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config }),
      scheduler: createSchedulerService({ delegate: taskSchedulerService }),
      taskService,
      taskExecutionService,
      taskSchedulerService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const invalid = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "" },
      });
      const first = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "First", triggerMode: "manual" },
      });
      const second = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "Second", triggerMode: "manual" },
      });

      expect(invalid.statusCode).toBe(400);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.message).toBe("Maximum task limit reached.");
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
    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [],
        default: {},
        connected: [],
      }),
    ),
    listAuthMethods: vi.fn(() => Promise.resolve({})),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
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

      const userMessageId = nextMessageId();
      const assistantMessageId = nextMessageId();
      sessionMessages.push({
        info: {
          id: userMessageId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [{ id: `part-${userMessageId}`, type: "text", text }],
      });
      sessionMessages.push({
        info: {
          id: assistantMessageId,
          sessionID,
          role: "assistant",
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: `part-${assistantMessageId}`,
            type: "text",
            text: `Task finished: ${text}`,
          },
        ],
      });
      session.time.updated = nextTime();
      return Promise.resolve();
    }),
    promptSessionAsync: vi.fn(),
    commandSession: vi.fn(),
    summarizeSession: vi.fn(),
    shellSession: vi.fn(),
    abortSession: vi.fn(),
    replyPermission: vi.fn(),
    replyQuestion: vi.fn(),
    rejectQuestion: vi.fn(),
    findText: vi.fn(),
    findFiles: vi.fn(),
    listFiles: vi.fn(),
    readFile: vi.fn(),
    getFileStatus: vi.fn(),
  } as unknown as OpenCodeService;
}
