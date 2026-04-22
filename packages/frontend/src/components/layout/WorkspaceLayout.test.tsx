import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });

  it("renders desktop context and bottom panes", () => {
    render(
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          tabs: [{ id: "terminal", label: "Terminal", content: <div>Terminal content</div> }],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [{ id: "files", label: "Files", content: <div>Files content</div> }],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    expect(screen.getByTestId("context-pane")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-pane")).toBeInTheDocument();
  });

  it("collapses and restores desktop panes", async () => {
    render(
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          tabs: [{ id: "terminal", label: "Terminal", content: <div>Terminal content</div> }],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [{ id: "files", label: "Files", content: <div>Files content</div> }],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse context pane" }));
    await user.click(screen.getByRole("button", { name: "Collapse bottom pane" }));

    expect(screen.getByTestId("context-pane")).toHaveClass("hidden");
    expect(screen.queryByTestId("bottom-pane")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore context pane" }));
    await user.click(screen.getByRole("button", { name: "Restore bottom pane" }));

    expect(screen.getByTestId("context-pane")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-pane")).toBeInTheDocument();
  });

  it("uses overlay controls on mobile", async () => {
    mockMatchMedia(false);

    render(
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          tabs: [{ id: "terminal", label: "Terminal", content: <div>Terminal content</div> }],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [{ id: "files", label: "Files", content: <div>Files content</div> }],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open context pane" }));
    expect(screen.getByText("Files content")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Open bottom pane" }));
    expect(screen.getByText("Terminal content")).toBeInTheDocument();
  });

  it("renders icon-only context tabs accessibly", async () => {
    render(
      <WorkspaceLayout
        contextPane={{
          title: "Context pane",
          tabs: [
            { id: "files", label: "Files", content: <div>Files content</div> },
            {
              id: "settings",
              label: "Settings",
              ariaLabel: "Agent settings",
              iconOnly: true,
              icon: <span>gear</span>,
              content: <div>Settings content</div>,
            },
          ],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Agent settings" }));

    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });
});

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches,
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}
