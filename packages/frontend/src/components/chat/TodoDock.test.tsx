import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TodoDock } from "./TodoDock";

function getToggleButton() {
  return screen.getByRole("button", { name: /Tasks/i });
}

describe("TodoDock", () => {
  it("renders nothing when todos is empty", () => {
    const { container } = render(<TodoDock todos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders collapsed by default and expands when clicked", () => {
    render(<TodoDock todos={[{ content: "First task", status: "pending" }]} />);

    expect(screen.queryByText("First task")).not.toBeInTheDocument();

    fireEvent.click(getToggleButton());
    expect(screen.getByText("First task")).toBeInTheDocument();
  });

  it("renders pending todos with the pending icon and content", () => {
    render(<TodoDock todos={[{ content: "Pending task", status: "pending" }]} />);

    fireEvent.click(getToggleButton());
    expect(screen.getByText("Pending task")).toBeInTheDocument();
    expect(screen.getByText("○")).toBeInTheDocument();
  });

  it("renders in-progress todos with activeForm when defined", () => {
    render(
      <TodoDock
        todos={[{ content: "Hidden content", status: "in_progress", activeForm: "Running form" }]}
      />,
    );

    fireEvent.click(getToggleButton());
    expect(screen.getByText("Running form")).toBeInTheDocument();
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    expect(screen.getByText("◉")).toBeInTheDocument();
  });

  it("falls back to content when in-progress activeForm is absent", () => {
    render(<TodoDock todos={[{ content: "Working task", status: "in_progress" }]} />);

    fireEvent.click(getToggleButton());
    expect(screen.getByText("Working task")).toBeInTheDocument();
  });

  it("renders completed todos with the completed icon and line-through style", () => {
    render(<TodoDock todos={[{ content: "Done task", status: "completed" }]} />);

    fireEvent.click(getToggleButton());
    const completedText = screen.getByText("Done task");
    expect(completedText).toHaveClass("line-through");
    expect(screen.getByText("✓")).toBeInTheDocument();
  });
});
