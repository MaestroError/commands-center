import { describe, expect, it } from "vitest";
import type { McpServer, Specialist, SpecialistCatalog } from "@cc/shared/schemas";

import { buildChatToolSummary } from "./chat-tools";

const agent: Specialist = {
  id: "agent-1",
  slug: "planner",
  name: "Planner",
  role: "Plans work",
  instructions: "Plan work.",
  defaultModel: "provider/model",
  workspacePath: "/workspace/planner",
  status: "active",
  capabilities: {
    builtInSkills: [],
    workspaceSkills: [],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appMcpServers: [],
    appToolPermissions: [],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const catalog: SpecialistCatalog = {
  builtInSkills: [],
  workspaceSkills: [],
  providerModels: [],
  mcpServers: [],
  appMcpServers: [],
  ccManagedMcpServers: [
    {
      name: "cc_default",
      enabledByDefault: true,
      systemManaged: true,
      description: "Default CommandsCenter tools.",
      tools: [
        {
          name: "list_tasks",
          description: "List tasks.",
          context: "both",
        },
      ],
    },
    {
      name: "cc_app",
      enabledByDefault: false,
      systemManaged: false,
      description: "Optional CommandsCenter tools.",
      tools: [
        {
          name: "show_file",
          description: "Show a file.",
          context: "chat",
        },
      ],
    },
  ],
  customTools: [],
};

describe("buildChatToolSummary", () => {
  it("includes enabled-by-default CC-managed tools", () => {
    const summary = buildChatToolSummary({ agent, catalog });

    expect(summary.ccManaged).toHaveLength(1);
    expect(summary.ccManaged[0]?.serverName).toBe("cc_default");
    expect(summary.ccManaged[0]?.tools[0]).toMatchObject({
      name: "list_tasks",
      description: "List tasks.",
      action: "allow",
      context: "both",
    });
  });

  it("hides CC-managed groups with no enabled tools", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          appToolPermissions: [{ pattern: "cc_app_show_file", action: "deny" }],
        },
      },
      catalog,
    });

    expect(summary.ccManaged.map((group) => group.serverName)).not.toContain("cc_app");
  });

  it("includes specialist-local custom tools without requiring a global selection", () => {
    const summary = buildChatToolSummary({
      agent,
      catalog,
      specialistCustomTools: [
        {
          slug: "local-helper",
          name: "Local Helper",
          description: "Runs local helper logic.",
          entryFile: "tool.ts",
          entryPath: "/workspace/planner/.opencode/tool/local-helper.ts",
          fingerprint: "fingerprint",
          status: "unknown",
          isManaged: false,
          warnings: [],
        },
      ],
    });

    expect(summary.customTools).toEqual([
      expect.objectContaining({
        slug: "local-helper",
        name: "Local Helper",
        source: "local",
      }),
    ]);
  });

  it("includes selected external MCP tool names when runtime discovery is available", () => {
    const mcpServer: McpServer = {
      id: "mcp-1",
      name: "github",
      enabled: true,
      config: {
        transport: "streamable-http",
        url: "https://example.com/mcp",
        authMethod: "none",
        headers: [],
      },
      missingSecrets: [],
      runtimeStatus: { status: "connected" },
      tools: [{ id: "github_create_issue", name: "create_issue" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: true, action: "ask" }],
          toolPermissions: [{ pattern: "github_create_issue", action: "allow" }],
        },
      },
      catalog,
      mcpServers: [mcpServer],
    });

    expect(summary.externalMcp).toEqual([
      expect.objectContaining({
        serverName: "github",
        tools: [expect.objectContaining({ name: "create_issue", action: "allow" })],
      }),
    ]);
  });

  it("prefers exact external MCP rules over broader wildcard rules", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [
            { pattern: "github_*", action: "deny" },
            { pattern: "github_create_issue", action: "allow" },
          ],
        },
      },
      catalog,
      mcpServers: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            transport: "streamable-http",
            url: "https://example.com/mcp",
            authMethod: "none",
            headers: [],
          },
          missingSecrets: [],
          runtimeStatus: { status: "connected" },
          tools: [{ id: "github_create_issue", name: "create_issue" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(summary.externalMcp[0]?.tools).toEqual([
      expect.objectContaining({ id: "github_create_issue", action: "allow" }),
    ]);
  });
});
