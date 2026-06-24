import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { now } from "../../src/db/ids";
import { mcp_servers } from "../../src/db/schema";
import { createSpecialistService } from "../../src/services/specialist-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("createSpecialistService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an agent record and portable workspace files", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "reviewer", "Code review helper");
    const dispose = vi.fn(() => Promise.resolve());
    const service = createSpecialistService({
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
          workspaceSkills: [],
          customTools: [],
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [{ pattern: "custom_review", action: "ask" }],
          appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          appToolPermissions: [],
        },
      });

      const markdown = await readFile(join(agent.workspacePath, "AGENTS.md"), "utf8");
      const config = await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8");

      expect(agent.status).toBe("active");
      expect(agent.slug).toBe("reviewer");
      expect(agent.workspacePath).toMatch(/\/specialists\/reviewer$/);
      await expect(
        stat(join(agent.workspacePath, ".opencode", "skills", "reviewer", "SKILL.md")),
      ).resolves.toBeDefined();
      expect(markdown).toContain("# Reviewer");
      expect(markdown).toContain("Review diffs and call out risks.");
      expect(config).toContain('"model": "openai/gpt-4.1"');
      expect(config).toContain('"github_*": "allow"');
      expect(config).toContain('"custom_review": "ask"');
      expect(config).toContain('"cc_app": {');
      expect(config).not.toContain('"cc_app_*"');
      // cc_default is enabled by default and carries an explicit 15s tool-call timeout.
      expect(config).toContain('"cc_default": {');
      expect(config).toContain('"timeout": 15000');
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates workspace files, renames the workspace folder, and disposes the instance", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = await createSkill(testDb.cwd, "planner", "Planning helper");
    const dispose = vi.fn(() => Promise.resolve());
    const service = createSpecialistService({
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
          workspaceSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
          appMcpServers: [],
          appToolPermissions: [],
        },
      });

      const updated = await service.update(created.id, {
        name: "Planner",
        instructions: "Plan before editing.",
        rewriteAgentsMd: true,
        capabilities: {
          builtInSkills: ["planner"],
          workspaceSkills: [],
          customTools: [],
          mcpServers: [{ name: "jira", enabled: false, action: "deny" }],
          toolPermissions: [{ pattern: "task_*", action: "allow" }],
          appMcpServers: [],
          appToolPermissions: [],
        },
      });

      expect(updated?.slug).toBe("planner");
      expect(updated?.workspacePath).toMatch(/\/specialists\/planner$/);
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
    const service = createSpecialistService({
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
          workspaceSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
          appMcpServers: [],
          appToolPermissions: [],
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
    const service = createSpecialistService({
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
          workspaceSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
          appMcpServers: [],
          appToolPermissions: [],
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
      expect(catalog.appMcpServers).toEqual([
        {
          name: "cc_app",
          enabledByDefault: false,
          description:
            "CommandsCenter app-managed, operator-interactive capabilities for this specialist.",
          tools: [
            {
              name: "create_custom_tool",
              description:
                "Create a blank CommandsCenter custom tool and return the folder path the specialist should edit.",
              context: "chat",
            },
            {
              name: "copy_custom_tool_to_specialist",
              description:
                "Copy a global CommandsCenter custom tool into a specialist workspace, asking the operator when overwrite or rename is needed.",
              context: "chat",
            },
            {
              name: "draft_specialist",
              description:
                "Open a prefilled specialist form in chat for the operator to review, edit, and confirm before the specialist is created. Pass whatever details you know (all optional) to pre-fill the form. Chat only.",
              context: "chat",
            },
            {
              name: "draft_specialist_update",
              description:
                "Open a prefilled form in chat with an existing specialist's current details for the operator to review, edit, and confirm before the update is saved. Provide the specialist id and optionally any suggested changes to pre-fill. Chat only.",
              context: "chat",
            },
            {
              name: "remove_specialist",
              description:
                "Remove a specialist from active use after operator confirmation by archiving its portable workspace state.",
              context: "chat",
            },
            {
              name: "draft_task",
              description:
                "Open a prefilled task form in chat for the operator to review, edit, and confirm before the task is created. Pass whatever details you know (all optional) to pre-fill the form. Chat only.",
              context: "chat",
            },
            {
              name: "draft_task_update",
              description:
                "Open a prefilled form in chat with an existing task's current details for the operator to review, edit, and confirm before the update is saved. Provide the task id and optionally any suggested changes to pre-fill. Chat only.",
              context: "chat",
            },
          ],
        },
        {
          name: "cc_specialist_management",
          enabledByDefault: false,
          description: "CommandsCenter specialist creation and update.",
          tools: [
            {
              name: "read_specialist_profile",
              description:
                "Read the full profile of a specialist by slug or ID, including its model, instructions, and capabilities. Administrative tool for authorized managers.",
              context: "both",
            },
            {
              name: "list_models",
              description:
                "List the model IDs available from connected providers. Use one of these IDs as defaultModel when creating or updating a specialist.",
              context: "both",
            },
            {
              name: "create_specialist",
              description:
                "Create a CommandsCenter specialist directly, without an operator review form. In chat, prefer draft_specialist so the operator can review and edit first.",
              context: "both",
            },
            {
              name: "update_specialist",
              description:
                "Update an existing CommandsCenter specialist by id directly, without an operator review form. In chat, prefer draft_specialist_update.",
              context: "both",
            },
          ],
        },
        {
          name: "cc_tasks_management",
          enabledByDefault: false,
          description: "CommandsCenter task creation, scheduling, triggering, and run inspection.",
          tools: [
            {
              name: "create_task",
              description:
                "Create a CommandsCenter task directly, without an operator review form. In chat, prefer draft_task so the operator can review and edit first.",
              context: "both",
            },
            {
              name: "update_task",
              description:
                "Update an existing CommandsCenter task by id directly, without an operator review form. In chat, prefer draft_task_update.",
              context: "both",
            },
            {
              name: "list_tasks",
              description: "List CommandsCenter tasks visible in this workspace.",
              context: "both",
            },
            {
              name: "get_task",
              description: "Read a CommandsCenter task by id.",
              context: "both",
            },
            {
              name: "queue_task",
              description: "Queue an existing CommandsCenter task.",
              context: "both",
            },
            {
              name: "schedule_task",
              description: "Schedule an existing CommandsCenter task for later execution.",
              context: "both",
            },
            {
              name: "list_task_runs",
              description: "List recent runs for a CommandsCenter task.",
              context: "both",
            },
            {
              name: "get_task_run",
              description: "Read a CommandsCenter task run by task id and run id.",
              context: "both",
            },
            {
              name: "create_task_template",
              description: "Create a recurring CommandsCenter task template.",
              context: "both",
            },
            {
              name: "run_task_template_now",
              description:
                "Generate and queue a run from a recurring CommandsCenter task template.",
              context: "both",
            },
            {
              name: "enable_task_template",
              description:
                "Enable (activate) a CommandsCenter task template. An active template resumes its recurring schedule and can be triggered by automation again. The schedule and all other settings are left unchanged.",
              context: "both",
            },
            {
              name: "disable_task_template",
              description:
                "Disable (deactivate) a CommandsCenter task template without changing its schedule or any other setting. A disabled template stops generating scheduled runs and cannot be triggered by automation or the API, but is kept for future reference and can be re-enabled later.",
              context: "both",
            },
          ],
        },
      ]);
      expect(catalog.appMcpServers.map((server) => server.name)).not.toContain("cc_default");
      expect(catalog.ccManagedMcpServers?.map((server) => server.name)).toEqual(
        expect.arrayContaining(["cc_default", "cc_default_interactive", "cc_app"]),
      );
      expect(
        catalog.ccManagedMcpServers
          ?.find((server) => server.name === "cc_default")
          ?.tools.map((tool) => tool.name),
      ).toEqual(expect.arrayContaining(["list_specialists", "get_self_profile"]));
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects duplicate agent identifiers instead of auto-suffixing them", async () => {
    const testDb = await createTestDatabase();
    const service = createSpecialistService({
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
          workspaceSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
          appMcpServers: [],
          appToolPermissions: [],
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
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
          },
        }),
      ).rejects.toThrow("Specialist identifier 'testing-agent' is already in use.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("drops references to MCP servers that no longer exist while preserving unrelated permissions", async () => {
    const testDb = await createTestDatabase();
    const service = createSpecialistService({
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
    const service = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: createMockOpenCodeService({ dispose }),
      skillRoot: join(testDb.cwd, "builtin-skills"),
    });

    try {
      const created = await service.create({
        name: "Testing Specialist",
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
        rewriteAgentsMd: true,
      });

      expect(updated?.workspacePath).toBe(
        join(testDb.config.paths.subdirectories.specialists, "testing-specialist"),
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
