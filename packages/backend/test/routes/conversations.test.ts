import { describe, expect, it } from "vitest";

import { createAgentService } from "../../src/services/agent-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("conversation routes", () => {
  it("supports opening, prompting, listing, and starting fresh for agent conversations", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService,
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await agentService.create({
        name: "Route Agent",
        role: "help with routes",
        instructions: "Be useful.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const opened = await server.inject({
        method: "GET",
        url: `/api/agents/${agent.id}/conversations/active`,
      });

      expect(opened.statusCode).toBe(200);
      const snapshot = opened.json<{ current: { id: string }; previous: unknown[] }>();
      expect(snapshot.previous).toEqual([]);

      const prompted = await server.inject({
        method: "POST",
        url: `/api/conversations/${snapshot.current.id}/prompt`,
        payload: {
          text: "Explain the plan",
          attachments: [],
        },
      });

      expect(prompted.statusCode).toBe(200);
      expect(prompted.json<{ messages: unknown[] }>().messages).toHaveLength(2);

      const listed = await server.inject({
        method: "GET",
        url: `/api/agents/${agent.id}/conversations`,
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);

      const fresh = await server.inject({
        method: "POST",
        url: `/api/agents/${agent.id}/conversations/start-fresh`,
      });

      expect(fresh.statusCode).toBe(201);
      expect(fresh.json<{ previous: Array<{ id: string }> }>().previous[0]?.id).toBe(
        snapshot.current.id,
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

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
  let sessionCount = 0;

  return {
    ...createBaseOpenCodeService(),
    createSession: (_directory, title) => {
      sessionCount += 1;

      return Promise.resolve({
        id: `ses-${String(sessionCount)}`,
        title,
        time: { created: 1_700_000_000_000, updated: 1_700_000_001_000 },
      });
    },
    getSession: (_directory, sessionID) =>
      Promise.resolve({
        id: sessionID,
        title: "Route Agent",
        time: { created: 1_700_000_000_000, updated: 1_700_000_003_000 },
      }),
    listSessionMessages: (_directory, sessionID) =>
      Promise.resolve([
        {
          info: {
            id: "msg-1",
            sessionID,
            role: "user",
            time: { created: 1_700_000_001_000 },
          },
          parts: [
            {
              id: "part-1",
              sessionID,
              messageID: "msg-1",
              type: "text",
              text: "Explain the plan",
            },
          ],
        },
        {
          info: {
            id: "msg-2",
            sessionID,
            role: "assistant",
            time: { created: 1_700_000_002_000, completed: 1_700_000_003_000 },
          },
          parts: [
            {
              id: "part-2",
              sessionID,
              messageID: "msg-2",
              type: "text",
              text: "Here is the plan.",
            },
          ],
        },
      ]),
    promptSession: () => Promise.resolve(),
    commandSession: () => Promise.resolve(),
    shellSession: () => Promise.resolve(),
  } as OpenCodeService;
}

function createBaseOpenCodeService() {
  return {
    dispose: () => Promise.resolve(),
    listProviders: () =>
      Promise.resolve({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "api",
            env: ["OPENAI_API_KEY"],
            models: {
              "openai/gpt-4.1": { name: "GPT-4.1" },
            },
          },
        ],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    listAuthMethods: () =>
      Promise.resolve({
        openai: [{ type: "api", label: "API key" }],
      }),
    setApiKey: () => Promise.resolve(true),
    startOauth: () =>
      Promise.resolve({
        url: "https://provider.example/oauth",
        method: "auto",
        instructions: "Finish login.",
      }),
    completeOauth: () => Promise.resolve(true),
    disconnectProvider: () => Promise.resolve(true),
  };
}
