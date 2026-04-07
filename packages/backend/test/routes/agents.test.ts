import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createTestDatabase } from "../helpers/db";

describe("agent routes", () => {
  it("supports create, list, get, update, catalog, and archive flows", async () => {
    const testDb = await createTestDatabase();
    await createSkill(testDb.cwd, "writer", "Writing helper");
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
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
            builtInSkills: ["writer"],
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
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json().builtInSkills).toEqual([
        {
          name: "writer",
          slug: "writer",
          description: "Writing helper",
        },
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

async function createSkill(cwd: string, slug: string, description: string): Promise<void> {
  const dir = join(cwd, ".opencode", "skills", slug);

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n`,
    "utf8",
  );
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
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
    createWorkspaceClient: () => ({
      request: () => Promise.reject(new Error("not used")),
      getPath: () => Promise.reject(new Error("not used")),
      disposeInstance: () => Promise.reject(new Error("not used")),
    }),
    disposeWorkspace: () => Promise.resolve(true),
  };
}
