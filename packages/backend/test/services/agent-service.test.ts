import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { now } from "../../src/db/ids";
import { mcp_servers } from "../../src/db/schema";
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
      await testDb.client.db.insert(mcp_servers).values({
        id: "mcp-1",
        name: "github",
        transport: "streamable-http",
        enabled: true,
        config_json: JSON.stringify({
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        }),
        created_at: now(),
        updated_at: now(),
      });

      const agent = await service.create({
        name: "Reviewer",
        role: "review code",
        instructions: "Review diffs and call out risks.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: ["reviewer"],
          customTools: [],
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [{ pattern: "custom_review", action: "ask" }],
        },
      });

      const markdown = await readFile(join(agent.workspacePath, "AGENTS.md"), "utf8");
      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");

      expect(agent.status).toBe("active");
      expect(agent.slug).toBe("reviewer");
      expect(agent.workspacePath).toMatch(/\/agents\/reviewer$/);
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
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const updated = await service.update(created.id, {
        name: "Planner",
        instructions: "Plan before editing.",
        capabilities: {
          builtInSkills: ["planner"],
          customTools: [],
          mcpServers: [{ name: "jira", enabled: false, action: "deny" }],
          toolPermissions: [{ pattern: "task_*", action: "allow" }],
        },
      });

      expect(updated?.slug).toBe("planner");
      expect(updated?.workspacePath).toMatch(/\/agents\/planner$/);
      expect(updated?.workspacePath).not.toBe(created.workspacePath);
      await expect(stat(created.workspacePath)).rejects.toThrow();
      await expect(
        stat(join(updated!.workspacePath, ".opencode", "skills", "planner", "SKILL.md")),
      ).resolves.toBeDefined();
      await expect(readFile(join(updated!.workspacePath, "AGENTS.md"), "utf8")).resolves.toContain(
        "Plan before editing.",
      );
      const configContent = await readFile(join(updated!.workspacePath, "opencode.jsonc"), "utf8");
      expect(configContent).not.toContain('"skill"');
      expect(configContent).toContain('"model"');
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
      skillRoot: join(testDb.cwd, "builtin-skills"),
    });

    try {
      const created = await service.create({
        name: "Archive Me",
        role: "cleanup",
        instructions: "Archive safely.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
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

  it("loads agents by slug and exposes richer built-in skill catalog details", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(
      testDb.cwd,
      "screen-writer",
      "Screen writing helper",
      "area: docs\n  version: 1.0.0",
    );
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      skillRoot,
    });

    try {
      const created = await service.create({
        name: "Screen Writer",
        role: "write screen docs",
        instructions: "Write screen docs.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: ["screen-writer"],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const loaded = await service.getBySlug(created.slug);
      const catalog = await service.getCatalog();

      expect(loaded?.id).toBe(created.id);
      expect(catalog.builtInSkills).toEqual([
        {
          name: "screen-writer",
          slug: "screen-writer",
          description: "Screen writing helper",
          category: "docs",
          version: "1.0.0",
          license: undefined,
          compatibility: undefined,
          metadata: {
            area: "docs",
            version: "1.0.0",
          },
          detailsMarkdown: "# screen-writer",
          files: ["SKILL.md"],
        },
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects duplicate agent identifiers instead of auto-suffixing them", async () => {
    const testDb = await createTestDatabase();
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      skillRoot: join(testDb.cwd, "builtin-skills"),
    });

    try {
      await service.create({
        name: "Testing agent",
        role: "test",
        instructions: "Test things.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      await expect(
        service.create({
          name: "Testing agent",
          role: "duplicate",
          instructions: "Duplicate.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
          },
        }),
      ).rejects.toThrow("Agent identifier 'testing-agent' is already in use.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("drops references to MCP servers that no longer exist while preserving unrelated permissions", async () => {
    const testDb = await createTestDatabase();
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService(),
      skillRoot: join(testDb.cwd, "builtin-skills"),
    });

    try {
      const agent = await service.create({
        name: "Normalizer",
        role: "clean capabilities",
        instructions: "Keep only valid MCP references.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [
            { pattern: "github_create_issue", action: "ask" },
            { pattern: "custom_write", action: "allow" },
          ],
        },
      });

      expect(agent.capabilities.mcpServers).toEqual([]);
      expect(agent.capabilities.toolPermissions).toEqual([
        { pattern: "custom_write", action: "allow" },
      ]);

      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");
      expect(config).not.toContain('"github"');
      expect(config).not.toContain('"github_create_issue"');
      expect(config).toContain('"custom_write": "allow"');
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates agents using the current workspace root even when stored workspace paths are stale", async () => {
    const testDb = await createTestDatabase();
    const dispose = vi.fn(() => Promise.resolve());
    const service = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService({ dispose }),
      skillRoot: join(testDb.cwd, "builtin-skills"),
    });

    try {
      const created = await service.create({
        name: "Testing Agent",
        role: "test",
        instructions: "Test workspace paths.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const updated = await service.update(created.id, {
        instructions: "Still works with CC_WORKSPACE_DIR.",
      });

      expect(updated?.workspacePath).toBe(
        join(testDb.config.paths.subdirectories.agents, "testing-agent"),
      );
      await expect(readFile(join(updated!.workspacePath, "AGENTS.md"), "utf8")).resolves.toContain(
        "Still works with CC_WORKSPACE_DIR.",
      );
      expect(dispose).toHaveBeenCalledWith(updated!.workspacePath);
    } finally {
      await testDb.cleanup();
    }
  });
});

async function createSkill(
  cwd: string,
  slug: string,
  description: string,
  metadataBlock?: string,
): Promise<string> {
  const root = join(cwd, "builtin-skills");
  const dir = join(root, slug);

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}${metadataBlock ? `\nmetadata:\n  ${metadataBlock}` : ""}\n---\n\n# ${slug}\n`,
    "utf8",
  );

  return root;
}

function createMockOpenCodeService(overrides?: {
  dispose?: ReturnType<typeof vi.fn>;
  disposeGlobal?: ReturnType<typeof vi.fn>;
}): OpenCodeService {
  return {
    dispose: overrides?.dispose ?? vi.fn(() => Promise.resolve()),
    disposeGlobal: overrides?.disposeGlobal ?? vi.fn(() => Promise.resolve()),
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
    summarizeSession: vi.fn(),
    shellSession: vi.fn(),
  } as unknown as OpenCodeService;
}
