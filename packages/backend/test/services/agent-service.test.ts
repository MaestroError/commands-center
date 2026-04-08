import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentService } from "../../src/services/agent-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("createAgentService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an agent record and portable workspace files", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "reviewer", "Code review helper");
    const dispose = vi.fn(() => Promise.resolve());
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService({ dispose }),
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
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates workspace files, renames the workspace folder, and disposes the instance", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "planner", "Planning helper");
    const dispose = vi.fn(() => Promise.resolve());
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService({ dispose }),
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
      expect(dispose).toHaveBeenCalledWith(updated!.workspacePath);
    } finally {
      await testDb.cleanup();
    }
  });

  it("archives agents by moving workspace state instead of orphaning it", async () => {
    const testDb = await createTestDatabase();
    const dispose = vi.fn(() => Promise.resolve());
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService({ dispose }),
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
      expect(dispose).toHaveBeenCalledWith(created.workspacePath);
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

function createMockOpenCodeService(overrides?: {
  dispose?: ReturnType<typeof vi.fn>;
}): OpenCodeService {
  return {
    dispose: overrides?.dispose ?? vi.fn(() => Promise.resolve()),
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
  } as unknown as OpenCodeService;
}
