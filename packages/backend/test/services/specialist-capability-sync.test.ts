import { describe, expect, it } from "vitest";

import {
  normalizeSpecialistCapabilities,
  removeMcpReferences,
  renameMcpReferences,
} from "../../src/services/specialist-capability-sync";

const server = (name: string) => ({ name, enabled: true, action: "allow" as const });

describe("specialist capability sync (pure)", () => {
  it("drops stale MCP servers and their tool permissions, dedupes, and defaults missing fields", () => {
    const result = normalizeSpecialistCapabilities(
      {
        builtInSkills: [],
        workspaceSkills: ["ws"],
        customTools: ["ct"],
        mcpServers: [server("github"), server("github"), server("gone")],
        toolPermissions: [
          { pattern: "github_*", action: "allow" },
          { pattern: "gone_delete", action: "deny" },
          { pattern: "custom_write", action: "ask" },
        ],
        appMcpServers: [server("cc_app"), server("removed_app")],
        appToolPermissions: [
          { pattern: "removed_app_*", action: "allow" },
          { pattern: "cc_app_read", action: "allow" },
        ],
      },
      ["github"],
      ["cc_app"],
    );

    // Deduped and stale-filtered.
    expect(result.mcpServers?.map((s) => s.name)).toEqual(["github"]);
    expect(result.appMcpServers?.map((s) => s.name)).toEqual(["cc_app"]);
    // Tool permissions tied to stale servers are removed; unrelated ones kept.
    expect(result.toolPermissions?.map((r) => r.pattern)).toEqual(["github_*", "custom_write"]);
    expect(result.appToolPermissions?.map((r) => r.pattern)).toEqual(["cc_app_read"]);
    expect(result.workspaceSkills).toEqual(["ws"]);
    expect(result.customTools).toEqual(["ct"]);
  });

  it("defaults every optional field when capabilities are sparse", () => {
    const result = normalizeSpecialistCapabilities({ builtInSkills: [] } as never, [], []);
    expect(result).toMatchObject({
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    });
  });

  it("removes references to a specific MCP server", () => {
    const result = removeMcpReferences(
      {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [server("github"), server("slack")],
        toolPermissions: [
          { pattern: "github_create", action: "allow" },
          { pattern: "slack_post", action: "allow" },
        ],
        appMcpServers: [],
        appToolPermissions: [],
      },
      "github",
    );
    expect(result.mcpServers?.map((s) => s.name)).toEqual(["slack"]);
    expect(result.toolPermissions?.map((r) => r.pattern)).toEqual(["slack_post"]);
  });

  it("renames an MCP server and rewrites its tool permission prefixes", () => {
    const result = renameMcpReferences(
      {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [server("github"), server("other")],
        toolPermissions: [
          { pattern: "github_*", action: "allow" },
          { pattern: "github_issue", action: "deny" },
          { pattern: "other_tool", action: "allow" },
        ],
        appMcpServers: [],
        appToolPermissions: [],
      },
      "github",
      "gh",
    );
    expect(result.mcpServers?.map((s) => s.name)).toEqual(["gh", "other"]);
    expect(result.toolPermissions?.map((r) => r.pattern)).toEqual([
      "gh_*",
      "gh_issue",
      "other_tool",
    ]);
  });
});
