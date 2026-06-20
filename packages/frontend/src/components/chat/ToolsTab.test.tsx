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
  it("shows a loading state before tools are available", () => {
    render(<ToolsTabContent errors={[]} loading={true} summary={emptySummary} />);

    expect(screen.getByText("Loading tools...")).toBeInTheDocument();
  });

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

  it("renders configured custom tools with source and availability badges", () => {
    render(
      <ToolsTabContent
        errors={[]}
        loading={false}
        summary={{
          ...emptySummary,
          customTools: [
            {
              slug: "local-helper",
              name: "Local Helper",
              description: "",
              source: "local",
              status: "unknown",
              enabled: true,
            },
            {
              slug: "missing-helper",
              name: "missing-helper",
              description: "",
              source: "missing_global",
              enabled: false,
            },
          ],
          totalCount: 2,
        }}
      />,
    );

    expect(screen.getByText("Custom Tools")).toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getAllByText("missing-helper")).toHaveLength(2);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("No description available.")).toHaveLength(2);
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
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows external MCP configuration when discovered tool names are unavailable", () => {
    render(
      <ToolsTabContent
        errors={[]}
        loading={false}
        summary={{
          ...emptySummary,
          externalMcp: [
            {
              serverName: "github",
              action: "allow",
              globalEnabled: false,
              runtimeStatus: { status: "needs_auth" },
              permissionPatterns: [{ pattern: "github_*", action: "ask" }],
              tools: [],
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("Globally disabled")).toBeInTheDocument();
    expect(screen.getByText("Needs auth")).toBeInTheDocument();
    expect(screen.getByText("github_*: ask")).toBeInTheDocument();
    expect(
      screen.getByText("Tool names and descriptions are not available from stored configuration."),
    ).toBeInTheDocument();
  });

  it("shows failed external MCP runtime status consistently", () => {
    render(
      <ToolsTabContent
        errors={[]}
        loading={false}
        summary={{
          ...emptySummary,
          externalMcp: [
            {
              serverName: "linear",
              action: "allow",
              runtimeStatus: { status: "failed", error: "Connection failed." },
              permissionPatterns: [],
              tools: [],
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows load errors when the tool summary is empty", () => {
    render(
      <ToolsTabContent
        errors={["Failed to load tool details.", "Failed to load tool details."]}
        loading={false}
        summary={emptySummary}
      />,
    );

    expect(screen.getAllByText("Failed to load tool details.")).toHaveLength(2);
    expect(screen.getByText("No tools configured for this specialist.")).toBeInTheDocument();
  });
});
