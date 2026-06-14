import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveBuiltInSkillsRoot } from "../../src/lib/builtin-skills";
import {
  getOpenCodeWorkspacePaths,
  listBuiltInSkills,
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
        appMcpServers: [{ name: "cc_tool_management", enabled: true, action: "allow" }],
        appToolPermissions: [{ pattern: "cc_tool_management_create_custom_tool", action: "ask" }],
      },
      appMcpEntries: {
        cc_tool_management: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-tool-management/specialists/writer",
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
        cc_tool_management: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-tool-management/specialists/writer",
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
        cc_tool_management: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-tool-management/specialists/writer",
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
            name: "cc_tool_management",
            enabled: true,
            action: "allow",
          },
        ],
        appToolPermissions: [{ pattern: "cc_tool_management_create_custom_tool", action: "allow" }],
      },
      appMcpEntries: {
        cc_tool_management: {
          type: "remote",
          url: "http://127.0.0.1:3000/api/mcp/cc/cc-tool-management/specialists/writer",
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

  it("resolves the curated skill library from bundled resources", () => {
    expect(resolveBuiltInSkillsRoot()).toContain("resources/builtinSkills");
  });

  it("rejects malformed skill frontmatter early", () => {
    expect(() => parseSkillFrontmatter("# missing frontmatter\n")).toThrow(
      "OpenCode skill must start with YAML frontmatter.",
    );
  });
});
