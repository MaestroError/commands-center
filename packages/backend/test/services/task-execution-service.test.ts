import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createConversationService } from "../../src/services/conversation-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskService } from "../../src/services/task-service";
import type {
  OpenCodeService,
  OpenCodeSession,
  OpenCodeSessionMessage,
} from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("createTaskExecutionService", () => {
  it("runs manual tasks through queued, running, and completed states", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Manual task",
        triggerMode: "manual",
      });

      const run = await executionService.trigger(task.id, { triggerSource: "manual" });
      const history = await taskService.listRuns(task.id);

      expect(run.status).toBe("completed");
      expect(run.startedAt).toBeDefined();
      expect(run.completedAt).toBeDefined();
      expect(run.renderedPrompt).toContain("Task: Manual task");
      expect(history).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates a task-owned OpenCode session and stores the result summary", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const opencodeService = createMockOpenCodeService();
    const conversationService = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });
    const executionService = createTaskExecutionService({ taskService, conversationService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Session task",
        description: "Use OpenCode.",
        context: "Persist everything.",
        triggerMode: "manual",
      });

      const run = await executionService.trigger(task.id, { triggerSource: "manual" });
      const inspection = await conversationService.inspectTaskRunConversation(task.id, run.id);
      const conversations = await conversationService.list(agent.id);

      expect(run.status).toBe("completed");
      expect(run.opencodeSessionId).toBe("session-1");
      expect(run.renderedPrompt).toContain("Assigned agent ID:");
      expect(run.resultSummary).toContain("Task finished:");
      expect(inspection.conversation?.source).toBe("task_run");
      expect(inspection.conversation?.messages).toHaveLength(2);
      expect(conversations).toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects manual triggers for disabled tasks", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Disabled task",
        triggerMode: "manual",
        enabled: false,
      });

      await expect(executionService.trigger(task.id, { triggerSource: "manual" })).rejects.toThrow(
        "Task must be enabled before it can run.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("cancels queued task runs", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Cancelable" });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        status: "queued",
      });
      const cancelled = await executionService.cancel(run.id, { reason: "Stop." });

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellationReason).toBe("Stop.");
    } finally {
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
    createSession: (_directory, title) => {
      sessionCount += 1;
      const session: OpenCodeSession = {
        id: `session-${String(sessionCount)}`,
        title,
        time: { created: nextTime(), updated: nextTime() },
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return Promise.resolve(session);
    },
    getSession: (_directory, sessionID) => {
      const session = sessions.get(sessionID);

      if (!session) {
        throw new Error("Session not found.");
      }

      return Promise.resolve(session);
    },
    listSessionMessages: (_directory, sessionID) => Promise.resolve(messages.get(sessionID) ?? []),
    promptSession: ({ sessionID, text }) => {
      const sessionMessages = messages.get(sessionID);
      const session = sessions.get(sessionID);

      if (!sessionMessages || !session) {
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
    },
  } as OpenCodeService;
}
