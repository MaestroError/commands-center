import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalTabBar } from "./TerminalTabBar";

import type { TerminalSession } from "@cc/shared/schemas";

const sessions: TerminalSession[] = [
  { id: "term-1", backend: "opencode", cwd: "/workspace/project", createdAt: 1 },
  { id: "term-2", backend: "root", cwd: "/", createdAt: 2 },
];

describe("TerminalTabBar", () => {
  it("creates, activates, and closes terminal tabs", () => {
    const onNew = vi.fn();
    const onActivate = vi.fn();
    const onClose = vi.fn();

    render(
      <TerminalTabBar
        activeId="term-1"
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNew}
        sessions={sessions}
      />,
    );

    fireEvent.click(screen.getByTestId("new-terminal-btn"));
    expect(onNew).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("terminal-tab-term-2"));
    expect(onActivate).toHaveBeenCalledWith("term-2");

    fireEvent.click(screen.getByTestId("close-terminal-btn-term-2"));
    expect(onClose).toHaveBeenCalledWith("term-2");
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("renders backend and cwd labels for each session", () => {
    render(
      <TerminalTabBar
        activeId="term-1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNew={vi.fn()}
        sessions={sessions}
      />,
    );

    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("OC")).toBeInTheDocument();
    expect(screen.getByText("Root")).toBeInTheDocument();
  });
});
