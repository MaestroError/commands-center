import { describe, expect, it } from "vitest";

import type { AgentCapabilitySelection } from "@cc/shared/schemas";

import {
  clearMcpServerOverride,
  getAppMcpServerAction,
  getAppMcpServerSelection,
  getAppMcpToolAction,
  getMcpServerAction,
  getMcpServerSelection,
  setAppMcpServerAction,
  setAppMcpServerEnabled,
  setAppMcpToolEnabled,
  setMcpServerAction,
  setMcpServerEnabled,
  upsertMcpServerSelection,
} from "./agent-capabilities";

function makeCapabilities(
  overrides: Partial<AgentCapabilitySelection> = {},
): AgentCapabilitySelection {
  return {
    builtInSkills: [],
    workspaceSkills: [],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appMcpServers: [],
    appToolPermissions: [],
    ...overrides,
  };
}

describe("agent-capabilities", () => {
  it("selects mcp and app mcp server overrides by name", () => {
    const capabilities = makeCapabilities({
      mcpServers: [{ name: "filesystem", enabled: true, action: "allow" }],
      appMcpServers: [{ name: "github", enabled: true, action: "ask" }],
    });

    expect(getMcpServerSelection(capabilities, "filesystem")).toMatchObject({ action: "allow" });
    expect(getMcpServerSelection(capabilities, "missing")).toBeUndefined();
    expect(getAppMcpServerSelection(capabilities, "github")).toMatchObject({ action: "ask" });
  });

  it("upserts server selections without keeping stale duplicates", () => {
    expect(
      upsertMcpServerSelection(
        [
          { name: "filesystem", enabled: true, action: "allow" },
          { name: "github", enabled: true, action: "ask" },
        ],
        { name: "filesystem", enabled: false, action: "deny" },
      ),
    ).toEqual([
      { name: "github", enabled: true, action: "ask" },
      { name: "filesystem", enabled: false, action: "deny" },
    ]);
  });

  it("enables and disables normal MCP servers while preserving or removing tool permissions", () => {
    const capabilities = makeCapabilities({
      mcpServers: [{ name: "filesystem", enabled: true, action: "ask" }],
      toolPermissions: [
        { pattern: "filesystem_read", action: "allow" },
        { pattern: "github_read", action: "allow" },
      ],
    });

    expect(setMcpServerEnabled(capabilities, "filesystem", true).mcpServers).toContainEqual({
      name: "filesystem",
      enabled: true,
      action: "ask",
    });

    const disabled = setMcpServerEnabled(capabilities, "filesystem", false);
    expect(disabled.mcpServers).toContainEqual({
      name: "filesystem",
      enabled: false,
      action: "deny",
    });
    expect(disabled.toolPermissions).toEqual([{ pattern: "github_read", action: "allow" }]);
  });

  it("maps normal MCP actions to none, disabled, and explicit actions", () => {
    const capabilities = makeCapabilities({
      mcpServers: [
        { name: "denied", enabled: true, action: "deny" },
        { name: "disabled", enabled: false, action: "allow" },
        { name: "allowed", enabled: true, action: "allow" },
      ],
    });

    expect(getMcpServerAction(capabilities, "missing")).toBe("none");
    expect(getMcpServerAction(capabilities, "denied")).toBe("disabled");
    expect(getMcpServerAction(capabilities, "disabled")).toBe("disabled");
    expect(getMcpServerAction(capabilities, "allowed")).toBe("allow");
  });

  it("sets and clears normal MCP actions", () => {
    const capabilities = makeCapabilities({
      mcpServers: [{ name: "filesystem", enabled: true, action: "ask" }],
      toolPermissions: [{ pattern: "filesystem_read", action: "allow" }],
    });

    expect(setMcpServerAction(capabilities, "filesystem", "allow").mcpServers).toContainEqual({
      name: "filesystem",
      enabled: true,
      action: "allow",
    });
    expect(setMcpServerAction(capabilities, "filesystem", "disabled")).toMatchObject({
      mcpServers: [{ name: "filesystem", enabled: false, action: "deny" }],
      toolPermissions: [],
    });
    expect(clearMcpServerOverride(capabilities, "filesystem")).toMatchObject({
      mcpServers: [],
      toolPermissions: [],
    });
    expect(setMcpServerAction(capabilities, "filesystem", "none")).toMatchObject({
      mcpServers: [],
      toolPermissions: [],
    });
  });

  it("enables, disables, and sets app MCP server actions", () => {
    const capabilities = makeCapabilities({
      appMcpServers: [{ name: "github", enabled: true, action: "ask" }],
      appToolPermissions: [
        { pattern: "github_create_issue", action: "deny" },
        { pattern: "slack_send", action: "deny" },
      ],
    });

    expect(setAppMcpServerEnabled(capabilities, "github", true).appMcpServers).toContainEqual({
      name: "github",
      enabled: true,
      action: "ask",
    });
    expect(setAppMcpServerAction(capabilities, "github", "allow")).toMatchObject({
      appMcpServers: [{ name: "github", enabled: true, action: "allow" }],
      appToolPermissions: [{ pattern: "slack_send", action: "deny" }],
    });
    expect(setAppMcpServerAction(capabilities, "github", "deny")).toMatchObject({
      appMcpServers: [],
      appToolPermissions: [{ pattern: "slack_send", action: "deny" }],
    });
  });

  it("reads and updates app MCP tool permissions", () => {
    const capabilities = makeCapabilities({
      appToolPermissions: [{ pattern: "github_create_issue", action: "deny" }],
    });

    expect(getAppMcpToolAction(capabilities, "github", "create_issue")).toBe("deny");
    expect(getAppMcpToolAction(capabilities, "github", "read_issue")).toBe("allow");
    expect(setAppMcpToolEnabled(capabilities, "github", "create_issue", true)).toMatchObject({
      appToolPermissions: [],
    });
    expect(setAppMcpToolEnabled(capabilities, "github", "read_issue", false)).toMatchObject({
      appToolPermissions: [
        { pattern: "github_create_issue", action: "deny" },
        { pattern: "github_read_issue", action: "deny" },
      ],
    });
  });

  it("defaults app MCP server actions to deny when no override exists", () => {
    const capabilities = makeCapabilities({
      appMcpServers: [{ name: "github", enabled: true, action: "allow" }],
    });

    expect(getAppMcpServerAction(capabilities, "github")).toBe("allow");
    expect(getAppMcpServerAction(capabilities, "missing")).toBe("deny");
  });
});
