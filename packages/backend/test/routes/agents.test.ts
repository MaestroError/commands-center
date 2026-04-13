import { describe, expect, it, vi } from "vitest";

import { createSchedulerService } from "../../src/services/scheduler-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("agent routes", () => {
  it("supports create, list, get, update, catalog, and archive flows", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
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
            builtInSkills: ["task-planner"],
            mcpServers: [{ name: "github", enabled: true, action: "allow" }],
            toolPermissions: [{ pattern: "custom_write", action: "ask" }],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json();

      const listed = await server.inject({
        method: "GET",
        url: "/api/agents",
      });
      const fetched = await server.inject({
        method: "GET",
        url: `/api/agents/${agent.id}`,
      });
      const fetchedBySlug = await server.inject({
        method: "GET",
        url: `/api/agents/by-slug/${agent.slug}`,
      });
      const catalog = await server.inject({
        method: "GET",
        url: "/api/agents/catalog",
      });
      const updated = await server.inject({
        method: "PATCH",
        url: `/api/agents/${agent.id}`,
        payload: {
          name: "Writer Prime",
        },
      });
      const archived = await server.inject({
        method: "DELETE",
        url: `/api/agents/${agent.id}`,
      });
      const withArchived = await server.inject({
        method: "GET",
        url: "/api/agents?includeArchived=true",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().name).toBe("Writer");
      expect(fetchedBySlug.statusCode).toBe(200);
      expect(fetchedBySlug.json().id).toBe(agent.id);
      expect(catalog.statusCode).toBe(200);
      const catalogBody = catalog.json<{ builtInSkills: Array<{ slug: string }> }>();
      expect(catalogBody.builtInSkills.map((skill) => skill.slug)).toEqual([
        "concise-summarizer",
        "final-review",
        "task-planner",
      ]);
      expect(updated.statusCode).toBe(200);
      expect(updated.json().slug).toBe("writer-prime");
      expect(archived.statusCode).toBe(200);
      expect(archived.json().status).toBe("archived");
      expect(withArchived.statusCode).toBe(200);
      expect(withArchived.json()[0].status).toBe("archived");
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
  return {
    dispose: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() =>
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
    ),
    listAuthMethods: vi.fn(() =>
      Promise.resolve({
        openai: [{ type: "api", label: "API key" }],
      }),
    ),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() =>
      Promise.resolve({
        url: "https://provider.example/oauth",
        method: "auto",
        instructions: "Finish login.",
      }),
    ),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
    createSession: vi.fn(),
    getSession: vi.fn(),
    listSessionMessages: vi.fn(),
    promptSession: vi.fn(),
    commandSession: vi.fn(),
    shellSession: vi.fn(),
  } as unknown as OpenCodeService;
}
