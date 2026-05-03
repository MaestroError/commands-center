import { describe, expect, it, vi } from "vitest";

import { agents } from "../../src/db/schema/index";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { AppDb } from "../../src/db/client";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("task routes", () => {
  it("supports task lifecycle and run history endpoints", async () => {
    const testDb = await createTestDatabase();
    const server = createServer({
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
      const agent = await insertAgent(testDb.client.db);
      const created = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          agentId: agent.id,
          title: "Ship release",
          description: "Prepare the release.",
          context: "Use current changelog.",
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
      const runs = await server.inject({ method: "GET", url: `/api/tasks/${task.id}/runs` });
      const deleted = await server.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
      const afterDelete = await server.inject({ method: "GET", url: `/api/tasks/${task.id}` });

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
      expect(runs.json()).toEqual([]);
      expect(deleted.statusCode).toBe(204);
      expect(afterDelete.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns validation failures and max limit conflicts", async () => {
    const testDb = await createTestDatabase();
    const config = { ...testDb.config, tasks: { maxTasks: 1 } };
    const server = createServer({
      config,
      logger: createLogger(config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config }),
      scheduler: createSchedulerService(),
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
    createSession: vi.fn(),
    getSession: vi.fn(),
    listSessionMessages: vi.fn(),
    promptSession: vi.fn(),
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
