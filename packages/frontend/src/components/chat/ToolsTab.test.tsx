import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolsTabContent } from "./ToolsTab";
import type { ChatToolSummary } from "@/lib/chat-tools";

const emptySummary: ChatToolSummary = {
  ccManaged: [],
  customTools: [],
  externalMcp: [],
  totalCount: 0,
};

describe("ToolsTabContent", () => {
  it("hides empty tool source sections", () => {
    render(
      <ToolsTabContent
        errors={[]}
        loading={false}
        summary={{
          ...emptySummary,
          ccManaged: [
            {
              serverName: "cc_default",
              description: "Default tools.",
              enabledByDefault: true,
              systemManaged: true,
              tools: [
                {
                  name: "list_tasks",
                  description: "List tasks.",
                  context: "both",
                  action: "allow",
                },
              ],
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("CommandsCenter")).toBeInTheDocument();
    expect(screen.queryByText("Custom Tools")).not.toBeInTheDocument();
    expect(screen.queryByText("External MCP")).not.toBeInTheDocument();
  });

  it("shows external MCP tool names without descriptions", () => {
    render(
      <ToolsTabContent
        errors={[]}
        loading={false}
        summary={{
          ...emptySummary,
          externalMcp: [
            {
              serverName: "github",
              action: "ask",
              globalEnabled: true,
              runtimeStatus: { status: "connected" },
              permissionPatterns: [],
              tools: [{ id: "github_create_issue", name: "create_issue", action: "ask" }],
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("External MCP")).toBeInTheDocument();
    expect(screen.getByText("create_issue")).toBeInTheDocument();
    expect(screen.getByText("No description available from this MCP server.")).toBeInTheDocument();
  });
});
