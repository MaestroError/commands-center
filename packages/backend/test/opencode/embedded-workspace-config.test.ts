import { describe, expect, it } from "vitest";

import {
  renderEmbeddedWorkspace,
  type EmbeddedMcpServerConfig,
} from "../../src/opencode/embedded-workspace-config.js";
import type { OpenCodeWorkspaceInput } from "../../src/opencode/workspace-contract.js";

const input: OpenCodeWorkspaceInput = {
  name: "Research",
  role: "Researcher",
  instructions: "Research carefully.",
  defaultModel: "openai/test",
  capabilities: {
    mcpServers: [{ name: "search", enabled: true, action: "ask" }],
    appMcpServers: [{ name: "cc_default", enabled: true, action: "allow" }],
    toolPermissions: [{ pattern: "shell", action: "deny" }],
    appToolPermissions: [{ pattern: "cc_default_*", action: "allow" }],
  },
};
const definitions: Record<string, EmbeddedMcpServerConfig> = {
  search: {
    type: "remote",
    url: "https://example.com/mcp",
    oauth: false,
    timeout: { execution: 60000 },
  },
  cc_default: { type: "remote", url: "http://127.0.0.1:4100/mcp", oauth: false },
  unselected: { type: "local", command: ["node", "server.mjs"] },
};
function rendered(specialist = input, servers = definitions) {
  return JSON.parse(renderEmbeddedWorkspace(specialist, servers).configJsonc) as {
    mcp: { servers: Record<string, EmbeddedMcpServerConfig & { codemode: boolean }> };
    permissions: { action: string; resource: string; effect: string }[];
  };
}

describe("native v2 specialist configuration", () => {
  it("writes complete remote MCP definitions", () => {
    expect(rendered().mcp.servers["search"]).toMatchObject({
      ...definitions["search"],
      disabled: false,
    });
  });
  it("disables unselected MCP servers", () => {
    expect(rendered().mcp.servers["unselected"]?.disabled).toBe(true);
  });
  it("preserves a globally disabled server", () => {
    expect(
      rendered(input, { ...definitions, search: { ...definitions["search"]!, disabled: true } }).mcp
        .servers["search"]?.disabled,
    ).toBe(true);
  });
  it("disables MCP Code Mode for individual tool permissions", () => {
    expect(Object.values(rendered().mcp.servers).every((server) => server.codemode === false)).toBe(
      true,
    );
  });
  it("rejects a selected server without a complete definition", () => {
    expect(() => renderEmbeddedWorkspace(input, {})).toThrow("Missing MCP definition");
  });
  it("rejects legacy enabled-only MCP definitions", () => {
    expect(() =>
      renderEmbeddedWorkspace(input, {
        search: { enabled: true } as unknown as EmbeddedMcpServerConfig,
      }),
    ).toThrow();
  });
  it("retains rule order for native permission overrides", () => {
    expect(rendered().permissions.slice(0, 4)).toEqual([
      { action: "search_*", resource: "*", effect: "ask" },
      { action: "cc_default_*", resource: "*", effect: "allow" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "cc_default_*", resource: "*", effect: "allow" },
    ]);
  });
  it("leaves CC context restrictions to session-specific native tools", () => {
    expect(rendered().permissions).not.toContainEqual({
      action: "cc_default_set_task_result",
      resource: "*",
      effect: "deny",
    });
  });
  it("uses the existing specialist rules format", () => {
    expect(renderEmbeddedWorkspace(input, definitions).rulesMarkdown).toBe(
      "# Research\n\n- Role: Researcher\n\n## Instructions\n\nResearch carefully.\n",
    );
  });
});
