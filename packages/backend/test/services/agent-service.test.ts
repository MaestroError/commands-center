import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentService } from "../../src/services/agent-service";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createTestDatabase } from "../helpers/db";

describe("createAgentService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an agent record and portable workspace files", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "reviewer", "Code review helper");
    const disposeWorkspace = vi.fn(() => Promise.resolve(true));
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(disposeWorkspace),
      skillRoot,
    });

    try {
      const agent = await service.create({
        name: "Reviewer",
        role: "review code",
        instructions: "Review diffs and call out risks.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: ["reviewer"],
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [{ pattern: "custom_review", action: "ask" }],
        },
      });

      const markdown = await readFile(join(agent.workspacePath, "AGENTS.md"), "utf8");
      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");

      expect(agent.status).toBe("active");
      expect(agent.slug).toBe("reviewer");
      await expect(
        stat(join(agent.workspacePath, ".opencode", "skills", "reviewer", "SKILL.md")),
      ).resolves.toBeDefined();
      expect(markdown).toContain("# Reviewer");
      expect(markdown).toContain("Review diffs and call out risks.");
      expect(config).toContain('"model": "openai/gpt-4.1"');
      expect(config).toContain('"github_*": "allow"');
      expect(config).toContain('"custom_review": "ask"');
      expect(disposeWorkspace).not.toHaveBeenCalled();
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates workspace files, renames the workspace folder, and disposes the instance", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "planner", "Planning helper");
    const disposeWorkspace = vi.fn(() => Promise.resolve(true));
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(disposeWorkspace),
      skillRoot,
    });

    try {
      const created = await service.create({
        name: "Builder",
        role: "ship features",
        instructions: "Implement the requested change.",
        defaultModel: "anthropic/claude-sonnet-4",
        capabilities: {
          builtInSkills: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const updated = await service.update(created.id, {
        name: "Planner",
        instructions: "Plan before editing.",
        capabilities: {
          builtInSkills: ["planner"],
          mcpServers: [{ name: "jira", enabled: false, action: "deny" }],
          toolPermissions: [{ pattern: "task_*", action: "allow" }],
        },
      });

      expect(updated?.slug).toBe("planner");
      expect(updated?.workspacePath).not.toBe(created.workspacePath);
      await expect(stat(created.workspacePath)).rejects.toThrow();
      await expect(
        stat(join(updated!.workspacePath, ".opencode", "skills", "planner", "SKILL.md")),
      ).resolves.toBeDefined();
      await expect(readFile(join(updated!.workspacePath, "AGENTS.md"), "utf8")).resolves.toContain(
        "Plan before editing.",
      );
      await expect(
        readFile(join(updated!.workspacePath, "opencode.jsonc"), "utf8"),
      ).resolves.toContain('"skill": {\n      "*": "deny",\n      "planner": "allow"');
      expect(disposeWorkspace).toHaveBeenCalledWith({ directory: updated!.workspacePath });
    } finally {
      await testDb.cleanup();
    }
  });

  it("archives agents by moving workspace state instead of orphaning it", async () => {
    const testDb = await createTestDatabase();
    const disposeWorkspace = vi.fn(() => Promise.resolve(true));
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      orchestrator: createOrchestrator(disposeWorkspace),
      skillRoot: join(testDb.cwd, ".opencode", "skills"),
    });

    try {
      const created = await service.create({
        name: "Archive Me",
        role: "cleanup",
        instructions: "Archive safely.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });
      const archived = await service.archive(created.id);

      expect(archived?.status).toBe("archived");
      expect(archived?.workspacePath).toContain("/.archived/");
      await expect(stat(archived!.workspacePath)).resolves.toBeDefined();
      expect(disposeWorkspace).toHaveBeenCalledWith({ directory: created.workspacePath });
    } finally {
      await testDb.cleanup();
    }
  });
});

async function createSkill(cwd: string, slug: string, description: string): Promise<string> {
  const root = join(cwd, ".opencode", "skills");
  const dir = join(root, slug);

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n`,
    "utf8",
  );

  return root;
}

function createOrchestrator(
  disposeWorkspace: OpenCodeOrchestrator["disposeWorkspace"],
): OpenCodeOrchestrator {
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
    disposeWorkspace,
  };
}
