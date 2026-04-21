import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GenericTool } from "./GenericTool";

import type { ConversationPart } from "@cc/shared/schemas";

function makePart(overrides: Record<string, unknown>): ConversationPart {
  return { id: "tool-1", type: "tool", ...overrides } as ConversationPart;
}

describe("GenericTool", () => {
  it("renders the tool name in the card header", () => {
    const part = makePart({
      tool: "fetch_docs",
      state: { status: "completed", input: { query: "hello" } },
    });

    render(<GenericTool part={part} />);

    expect(screen.getByText("fetch_docs")).toBeInTheDocument();
  });

  it("renders the status label", () => {
    const part = makePart({
      tool: "fetch_docs",
      state: { status: "completed", input: { query: "hello" } },
    });

    render(<GenericTool part={part} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("reveals the input block when expanded", async () => {
    const user = userEvent.setup();
    const part = makePart({
      tool: "fetch_docs",
      state: { status: "completed", input: { query: "hello" } },
    });

    render(<GenericTool part={part} />);

    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    await user.click(screen.getByText("fetch_docs"));

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText(/"query": "hello"/)).toBeInTheDocument();
  });
});
