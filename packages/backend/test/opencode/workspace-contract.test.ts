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
        customTools: [],
        mcpServers: [{ name: "github", enabled: true, action: "allow" }],
        toolPermissions: [{ pattern: "custom_write", action: "ask" }],
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
      },
      permission: {
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
        customTools: [],
        mcpServers: [{ name: "github", enabled: true, action: "deny" }],
        toolPermissions: [{ pattern: "github_create_issue", action: "ask" }],
      },
    });

    const parsed = JSON.parse(rendered.configJsonc) as { permission: Record<string, string> };

    expect(Object.keys(parsed.permission)).toEqual(["github_*", "github_create_issue"]);
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
          category: "General",
          version: undefined,
          license: undefined,
          compatibility: "opencode",
          metadata: {},
          detailsMarkdown: "# writer",
          files: ["SKILL.md"],
        },
      ]);

      await writeOpenCodeWorkspace({
        workspacePath: join(testDb.config.paths.subdirectories.agents, "writer-agent"),
        input: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: ["writer"],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
        skillRoot,
      });

      const paths = getOpenCodeWorkspacePaths(
        join(testDb.config.paths.subdirectories.agents, "writer-agent"),
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
