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

function makeMcpServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
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
    requiresEngineRestart: false,
    runtimeStatus: { status: "connected" },
    tools: [{ id: "github_create_issue", name: "create_issue" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

  it("includes explicitly enabled optional CC-managed tools with ask action", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          appMcpServers: [{ name: "cc_app", enabled: true, action: "ask" }],
        },
      },
      catalog,
    });

    expect(summary.ccManaged).toEqual([
      expect.objectContaining({ serverName: "cc_default" }),
      expect.objectContaining({
        serverName: "cc_app",
        tools: [expect.objectContaining({ name: "show_file", action: "ask" })],
      }),
    ]);
  });

  it("uses exact CC-managed tool permission action over server action", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          appToolPermissions: [{ pattern: "cc_default_list_tasks", action: "ask" }],
        },
      },
      catalog,
    });

    expect(summary.ccManaged[0]?.tools[0]?.action).toBe("ask");
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

  it("includes selected catalog custom tools", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          customTools: ["global-helper"],
        },
      },
      catalog: {
        ...catalog,
        customTools: [
          {
            slug: "global-helper",
            name: "Global Helper",
            description: "Runs global helper logic.",
            enabled: true,
          },
        ],
      },
    });

    expect(summary.customTools).toEqual([
      expect.objectContaining({
        slug: "global-helper",
        name: "Global Helper",
        source: "managed",
        enabled: true,
      }),
    ]);
  });

  it("marks selected custom tools missing when no global or specialist copy exists", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          customTools: ["missing-helper"],
        },
      },
      catalog,
    });

    expect(summary.customTools).toEqual([
      expect.objectContaining({
        slug: "missing-helper",
        name: "missing-helper",
        source: "missing_global",
        enabled: false,
      }),
    ]);
  });

  it("includes selected external MCP tool names when runtime discovery is available", () => {
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
      mcpServers: [makeMcpServer()],
    });

    expect(summary.externalMcp).toEqual([
      expect.objectContaining({
        serverName: "github",
        tools: [expect.objectContaining({ name: "create_issue", action: "allow" })],
      }),
    ]);
  });

  it("includes selected external MCP servers even when runtime discovery is unavailable", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [{ pattern: "github_*", action: "ask" }],
        },
      },
      catalog,
    });

    expect(summary.externalMcp).toEqual([
      expect.objectContaining({
        serverName: "github",
        tools: [],
        permissionPatterns: [{ pattern: "github_*", action: "ask" }],
      }),
    ]);
    expect(summary.totalCount).toBe(2);
  });

  it("hides disabled external MCP server selections", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: false, action: "allow" }],
        },
      },
      catalog,
      mcpServers: [makeMcpServer()],
    });

    expect(summary.externalMcp).toEqual([]);
  });

  it("hides external MCP tools denied by permission rules", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [{ pattern: "github_create_issue", action: "deny" }],
        },
      },
      catalog,
      mcpServers: [makeMcpServer()],
    });

    expect(summary.externalMcp[0]?.tools).toEqual([]);
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
      mcpServers: [makeMcpServer()],
    });

    expect(summary.externalMcp[0]?.tools).toEqual([
      expect.objectContaining({ id: "github_create_issue", action: "allow" }),
    ]);
  });

  it("prefers the most specific external MCP wildcard rule", () => {
    const summary = buildChatToolSummary({
      agent: {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          mcpServers: [{ name: "github", enabled: true, action: "allow" }],
          toolPermissions: [
            { pattern: "github_*", action: "deny" },
            { pattern: "github_create_*", action: "ask" },
          ],
        },
      },
      catalog,
      mcpServers: [makeMcpServer()],
    });

    expect(summary.externalMcp[0]?.tools).toEqual([
      expect.objectContaining({ id: "github_create_issue", action: "ask" }),
    ]);
  });
});
