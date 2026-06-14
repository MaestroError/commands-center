import { describe, expect, it } from "vitest";

import { normalizeAgentFilePath } from "../../../src/mcp/cc-managed/groups/cc-app/tools/show-file-to-user";

describe("normalizeAgentFilePath", () => {
  const options = {
    agentSlug: "testing-agent",
    workspaceDir: "/Users/revazgh/cc-dev/.cc/workspace",
    agentsDir: "/Users/revazgh/cc-dev/.cc/workspace/agents",
  };

  it("keeps agent-relative paths unchanged", () => {
    expect(normalizeAgentFilePath({ ...options, path: "mermaid.png" })).toBe("mermaid.png");
  });

  it("converts workspace-relative agent paths to agent-relative paths", () => {
    expect(
      normalizeAgentFilePath({ ...options, path: "agents/testing-agent/reports/mermaid.png" }),
    ).toBe("reports/mermaid.png");
  });

  it("converts absolute paths inside the agent workspace to agent-relative paths", () => {
    expect(
      normalizeAgentFilePath({
        ...options,
        path: "/Users/revazgh/cc-dev/.cc/workspace/specialists/testing-agent/mermaid.png",
      }),
    ).toBe("mermaid.png");
  });

  it("rejects absolute paths outside the agent workspace", () => {
    expect(() =>
      normalizeAgentFilePath({
        ...options,
        path: "/Users/revazgh/cc-dev/.cc/workspace/specialists/other-agent/secret.md",
      }),
    ).toThrow("Absolute paths must point inside this agent workspace.");
  });
});
