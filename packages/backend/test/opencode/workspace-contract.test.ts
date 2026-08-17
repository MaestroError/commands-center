import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveBuiltInSkillsRoot } from "../../src/lib/builtin-skills";
import {
  getOpenCodeWorkspacePaths,
  listBuiltInSkills,
  type OpenCodeWorkspaceInput,
  OPENCODE_WORKSPACE_CONTRACT,
  parseRulesMarkdown,
  parseSkillFrontmatter,
  renderOpenCodeWorkspace,
  validateOpenCodeWorkspace,
  writeOpenCodeWorkspace,
} from "../../src/opencode/workspace-contract";
import { createTestDatabase } from "../helpers/db";

describe("OPENCODE_WORKSPACE_CONTRACT", () => {
  it("documents the canonical workspace file layout in one place", () => {
    expect(OPENCODE_WORKSPACE_CONTRACT.files.rules.relativePath).toBe("AGENTS.md");
    expect(OPENCODE_WORKSPACE_CONTRACT.files.config.relativePath).toBe("opencode.jsonc");
    expect(OPENCODE_WORKSPACE_CONTRACT.files.skills.relativePath).toBe(".opencode/skills");
    expect(OPENCODE_WORKSPACE_CONTRACT.files.config.docs).toContain(
      "https://opencode.ai/docs/config/",
    );
  });

  it("renders and validates OpenCode workspace files against the contract", () => {
    const rendered = renderOpenCodeWorkspace({
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {
        builtInSkills: ["writer"],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [{ name: "github", enabled: true, action: "allow" }],
        toolPermissions: [{ pattern: "custom_write", action: "ask" }],
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
        appToolPermissions: [{ pattern: "cc_app_create_custom_tool", action: "ask" }],
      },
      appMcpEntries: {
        cc_app: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-app/specialists/writer",
          enabled: true,
          oauth: false,
          headers: {
            Authorization: "Bearer token",
          },
        },
      },
    });

    expect(parseRulesMarkdown(rendered.rulesMarkdown)).toEqual({
      title: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
    });
    expect(JSON.parse(rendered.configJsonc)).toEqual({
      $schema: "https://opencode.ai/config.json",
      model: "openai/gpt-4.1",
      mcp: {
        github: { enabled: true },
        cc_app: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-app/specialists/writer",
          enabled: true,
          oauth: false,
          headers: {
            Authorization: "Bearer token",
          },
        },
      },
      permission: {
        cc_default_set_task_result: "deny",
        cc_default_add_task_artifact: "deny",
        cc_default_mark_needs_human_review: "deny",
        "github_*": "allow",
        custom_write: "ask",
      },
    });

    expect(() => validateOpenCodeWorkspace(rendered)).not.toThrow();
  });

  it("omits workspace boundaries from rendered specialist rules", () => {
    const rendered = renderOpenCodeWorkspace({
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
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

    expect(rendered.rulesMarkdown).not.toContain("Workspace Boundaries");
  });

  it("renders server wildcards before tool overrides so specific rules win", () => {
    const rendered = renderOpenCodeWorkspace({
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [{ name: "github", enabled: true, action: "deny" }],
        toolPermissions: [{ pattern: "github_create_issue", action: "ask" }],
        appMcpServers: [],
        appToolPermissions: [],
      },
      appMcpEntries: {
        cc_app: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-app/specialists/writer",
          enabled: false,
          oauth: false,
          headers: {
            Authorization: "Bearer token",
          },
        },
      },
    });

    const parsed = JSON.parse(rendered.configJsonc) as { permission: Record<string, string> };

    expect(Object.keys(parsed.permission)).toEqual([
      "cc_default_set_task_result",
      "cc_default_add_task_artifact",
      "cc_default_mark_needs_human_review",
      "github_*",
      "github_create_issue",
    ]);
  });

  it("renders disabled MCP server overrides without wildcard permissions", () => {
    const rendered = renderOpenCodeWorkspace({
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [{ name: "github", enabled: false, action: "deny" }],
        toolPermissions: [],
        appMcpServers: [],
        appToolPermissions: [],
      },
    });

    expect(JSON.parse(rendered.configJsonc)).toEqual({
      $schema: "https://opencode.ai/config.json",
      model: "openai/gpt-4.1",
      mcp: {
        github: { enabled: false },
      },
      permission: {
        cc_default_set_task_result: "deny",
        cc_default_add_task_artifact: "deny",
        cc_default_mark_needs_human_review: "deny",
      },
    });
  });

  it("writes only CC-managed task-run tool denies to opencode.jsonc", () => {
    const rendered = renderOpenCodeWorkspace({
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs and keep them accurate.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
        appMcpServers: [
          {
            name: "cc_app",
            enabled: true,
            action: "allow",
          },
        ],
        appToolPermissions: [{ pattern: "cc_app_create_custom_tool", action: "allow" }],
      },
      appMcpEntries: {
        cc_app: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-app/specialists/writer",
          enabled: true,
          oauth: false,
          headers: {
            Authorization: "Bearer token",
          },
        },
      },
    });

    const parsed = JSON.parse(rendered.configJsonc) as { permission: Record<string, string> };

    expect(parsed.permission).toEqual({
      cc_default_set_task_result: "deny",
      cc_default_add_task_artifact: "deny",
      cc_default_mark_needs_human_review: "deny",
    });
  });

  it("copies validated skills into the documented .opencode path", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const skillDir = join(skillRoot, "writer");

    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: writer\ndescription: Writing helper\ncompatibility: opencode\n---\n\n# writer\n",
        "utf8",
      );

      await expect(listBuiltInSkills(skillRoot)).resolves.toEqual([
        {
          name: "writer",
          slug: "writer",
          description: "Writing helper",
          category: "custom",
          version: undefined,
          license: undefined,
          compatibility: "opencode",
          metadata: {},
          detailsMarkdown: "# writer",
          files: ["SKILL.md"],
        },
      ]);

      await writeOpenCodeWorkspace({
        workspacePath: join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
        input: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: ["writer"],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
          },
        },
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
      });

      const paths = getOpenCodeWorkspacePaths(
        join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
      );
      await expect(
        readFile(join(paths.skillsDir, "writer", "SKILL.md"), "utf8"),
      ).resolves.toContain("description: Writing helper");
    } finally {
      await testDb.cleanup();
    }
  });

  it("copies the bundled OKF skill support files into a specialist workspace", async () => {
    const testDb = await createTestDatabase();
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "knowledge-manager");

    try {
      await writeOpenCodeWorkspace({
        workspacePath,
        input: {
          name: "Knowledge Manager",
          role: "maintain knowledge",
          instructions: "Keep durable knowledge accurate.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: ["okf-md-knowledge-base-management"],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
          },
        },
        skillRoot: resolveBuiltInSkillsRoot(),
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
      });

      const skillPath = join(
        getOpenCodeWorkspacePaths(workspacePath).skillsDir,
        "okf-md-knowledge-base-management",
      );
      const [skill, agentMetadata, conformanceProfile] = await Promise.all([
        readFile(join(skillPath, "SKILL.md"), "utf8"),
        readFile(join(skillPath, "agents", "openai.yaml"), "utf8"),
        readFile(join(skillPath, "references", "okf-v0.2-profile.md"), "utf8"),
      ]);

      expect(skill).toContain("# OKF Markdown Knowledge Base Management");
      expect(agentMetadata).toContain('display_name: "OKF Markdown Knowledge Base Management"');
      expect(conformanceProfile).toContain("# OKF v0.2 Conformance Profile");
    } finally {
      await testDb.cleanup();
    }
  });

  it("copies renamed built-in skill aliases using the current slug", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const skillDir = join(skillRoot, "global-skill-authoring");

    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: global-skill-authoring\ndescription: Global skill helper\ncompatibility: opencode\n---\n\n# global-skill-authoring\n",
        "utf8",
      );

      await writeOpenCodeWorkspace({
        workspacePath: join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
        input: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: ["custom-skill-authoring"],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
          },
        },
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
      });

      const paths = getOpenCodeWorkspacePaths(
        join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
      );
      await expect(
        readFile(join(paths.skillsDir, "global-skill-authoring", "SKILL.md"), "utf8"),
      ).resolves.toContain("description: Global skill helper");
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves an untracked local skill while refreshing a managed skill", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Writing helper version one");
      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });
      await writeTestSkill(skillsDir, "designer-local", "Private designer workflow");
      await writeTestSkill(skillRoot, "writer", "Writing helper version two");

      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });

      await expect(
        readFile(join(skillsDir, "designer-local", "SKILL.md"), "utf8"),
      ).resolves.toContain("Private designer workflow");
      await expect(readFile(join(skillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain(
        "Writing helper version two",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes an unassigned managed skill without removing an untracked local skill", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Writing helper");
      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });
      await writeTestSkill(skillsDir, "designer-local", "Private designer workflow");

      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
      });

      await expect(readFile(join(skillsDir, "writer", "SKILL.md"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        readFile(join(skillsDir, "designer-local", "SKILL.md"), "utf8"),
      ).resolves.toContain("Private designer workflow");
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves unknown directories when adopting a workspace without a manifest", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Writing helper");
      await writeTestSkill(skillsDir, "designer-local", "Private designer workflow");

      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });

      await expect(
        readFile(join(skillsDir, "designer-local", "SKILL.md"), "utf8"),
      ).resolves.toContain("Private designer workflow");
    } finally {
      await testDb.cleanup();
    }
  });

  it("records current assignments when adopting a workspace without a manifest", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Writing helper");

      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });

      await expect(readManagedManifest(skillsDir)).resolves.toEqual({
        version: 1,
        skills: [{ slug: "writer", source: "built-in" }],
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves unknown directories when replacing a malformed manifest", async () => {
    const testDb = await createTestDatabase();
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillsDir, "designer-local", "Private designer workflow");
      await writeFile(join(skillsDir, ".cc-managed.json"), "not json", "utf8");

      await writeTestWorkspace({
        workspacePath,
        skillRoot: join(testDb.cwd, "builtin-skills"),
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
      });

      await expect(
        readFile(join(skillsDir, "designer-local", "SKILL.md"), "utf8"),
      ).resolves.toContain("Private designer workflow");
    } finally {
      await testDb.cleanup();
    }
  });

  it("records renamed built-in aliases under their installed slug", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "global-skill-authoring", "Global skill helper");

      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["custom-skill-authoring"],
      });

      await expect(readManagedManifest(skillsDir)).resolves.toEqual({
        version: 1,
        skills: [{ slug: "global-skill-authoring", source: "built-in" }],
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects colliding managed slugs before changing existing skills", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspaceSkillRoot = testDb.config.paths.subdirectories.skills;
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Built-in writer");
      await writeTestSkill(workspaceSkillRoot, "writer", "Workspace writer");
      await writeTestSkill(skillsDir, "designer-local", "Private designer workflow");

      await expect(
        writeTestWorkspace({
          workspacePath,
          skillRoot,
          workspaceSkillRoot,
          builtInSkills: ["writer"],
          workspaceSkills: ["writer"],
        }),
      ).rejects.toThrow("Managed skill slug 'writer' is selected more than once");
      await expect(
        readFile(join(skillsDir, "designer-local", "SKILL.md"), "utf8"),
      ).resolves.toContain("Private designer workflow");
    } finally {
      await testDb.cleanup();
    }
  });

  it("keeps managed files and ownership unchanged when a requested source is missing", async () => {
    const testDb = await createTestDatabase();
    const skillRoot = join(testDb.cwd, "builtin-skills");
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer-agent");
    const skillsDir = getOpenCodeWorkspacePaths(workspacePath).skillsDir;

    try {
      await writeTestSkill(skillRoot, "writer", "Installed writer");
      await writeTestWorkspace({
        workspacePath,
        skillRoot,
        workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        builtInSkills: ["writer"],
      });
      const previousManifest = await readManagedManifest(skillsDir);

      await expect(
        writeTestWorkspace({
          workspacePath,
          skillRoot,
          workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
          builtInSkills: ["missing-skill"],
        }),
      ).rejects.toThrow("Built-in skill 'missing-skill' was not found");
      await expect(readFile(join(skillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain(
        "Installed writer",
      );
      await expect(readManagedManifest(skillsDir)).resolves.toEqual(previousManifest);
    } finally {
      await testDb.cleanup();
    }
  });

  it("reports missing built-in skills with an actionable error", async () => {
    const testDb = await createTestDatabase();

    try {
      await expect(
        writeOpenCodeWorkspace({
          workspacePath: join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
          input: {
            name: "Writer",
            role: "write docs",
            instructions: "Write useful docs.",
            defaultModel: "openai/gpt-4.1",
            capabilities: {
              builtInSkills: ["missing-skill"],
              workspaceSkills: [],
              customTools: [],
              mcpServers: [],
              toolPermissions: [],
              appMcpServers: [],
              appToolPermissions: [],
            },
          },
          skillRoot: join(testDb.cwd, "builtin-skills"),
          workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        }),
      ).rejects.toThrow(
        "Built-in skill 'missing-skill' was not found. Update this specialist's skill capabilities or restore the missing skill directory.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("reports missing renamed built-in skill aliases with the target slug", async () => {
    const testDb = await createTestDatabase();

    try {
      await expect(
        writeOpenCodeWorkspace({
          workspacePath: join(testDb.config.paths.subdirectories.specialists, "writer-agent"),
          input: {
            name: "Writer",
            role: "write docs",
            instructions: "Write useful docs.",
            defaultModel: "openai/gpt-4.1",
            capabilities: {
              builtInSkills: ["custom-skill-authoring"],
              workspaceSkills: [],
              customTools: [],
              mcpServers: [],
              toolPermissions: [],
              appMcpServers: [],
              appToolPermissions: [],
            },
          },
          skillRoot: join(testDb.cwd, "builtin-skills"),
          workspaceSkillRoot: testDb.config.paths.subdirectories.skills,
        }),
      ).rejects.toThrow(
        "Built-in skill 'custom-skill-authoring' was not found. It maps to 'global-skill-authoring'. Update this specialist's skill capabilities or restore the missing skill directory.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("resolves the curated skill library from bundled resources", () => {
    expect(resolveBuiltInSkillsRoot()).toContain("resources/builtinSkills");
  });

  it("rejects malformed skill frontmatter early", () => {
    expect(() => parseSkillFrontmatter("# missing frontmatter\n")).toThrow(
      "OpenCode skill must start with YAML frontmatter.",
    );
  });
});

async function writeTestSkill(root: string, slug: string, description: string): Promise<void> {
  const skillDir = join(root, slug);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}\ncompatibility: opencode\n---\n\n# ${slug}\n`,
    "utf8",
  );
}

async function writeTestWorkspace(options: {
  workspacePath: string;
  skillRoot: string;
  workspaceSkillRoot: string;
  builtInSkills?: string[];
  workspaceSkills?: string[];
}): Promise<void> {
  const input: OpenCodeWorkspaceInput = {
    name: "Writer",
    role: "write docs",
    instructions: "Write useful docs.",
    defaultModel: "openai/gpt-4.1",
    capabilities: {
      builtInSkills: options.builtInSkills ?? [],
      workspaceSkills: options.workspaceSkills ?? [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
  };

  await writeOpenCodeWorkspace({
    workspacePath: options.workspacePath,
    input,
    skillRoot: options.skillRoot,
    workspaceSkillRoot: options.workspaceSkillRoot,
  });
}

async function readManagedManifest(skillsDir: string): Promise<unknown> {
  return JSON.parse(await readFile(join(skillsDir, ".cc-managed.json"), "utf8")) as unknown;
}
