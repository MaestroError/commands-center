import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolCallCard } from "./ToolCallCard";

import type { ConversationPart } from "@cc/shared/schemas";

describe("ToolCallCard", () => {
  it("renders the tool name and status variants", () => {
    const { rerender } = render(
      <ToolCallCard
        part={{ id: "part-1", type: "tool_call", tool: "search", state: { status: "pending" } }}
      />,
    );

    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();

    rerender(
      <ToolCallCard
        part={{ id: "part-1", type: "tool_call", name: "planner", state: { status: "completed" } }}
      />,
    );
    expect(screen.getByText("planner")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();

    rerender(
      <ToolCallCard
        part={
          { id: "part-1", type: "tool_call", state: { status: "error" } } satisfies ConversationPart
        }
      />,
    );
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows formatted input, output, and error details when expanded", () => {
    render(
      <ToolCallCard
        part={{
          id: "part-2",
          type: "tool_call",
          tool: "execute",
          state: {
            status: "completed",
            input: { command: "pwd" },
            output: "done",
            error: { message: "warn" },
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText(/"command": "pwd"/)).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText(/"message": "warn"/)).toBeInTheDocument();
  });

  it("shows a fallback message when no tool details are available", () => {
    render(<ToolCallCard part={{ id: "part-3", type: "tool_call", state: {} }} />);

    fireEvent.click(screen.getByRole("button", { name: /Tool/i }));

    expect(screen.getByText("No details available.")).toBeInTheDocument();
  });
});
