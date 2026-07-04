import { fireEvent, render, screen } from "@testing-library/react";
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

  it("reloads the page from the mobile toolbar", async () => {
    mockMatchMedia(false);
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(
      <WorkspaceLayout
        contextPane={{
          title: "Context pane",
          tabs: [{ id: "files", label: "Files", content: <div>Files content</div> }],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reload page" }));

    expect(reload).toHaveBeenCalled();
  });

  it("resizes the context and bottom panes by dragging their handles", () => {
    const { container } = render(
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

    const contextHandle = container.querySelector(".cursor-col-resize") as HTMLElement;
    fireEvent.pointerDown(contextHandle, { clientX: 400 });
    fireEvent(window, new MouseEvent("pointermove", { clientX: 320 }));
    fireEvent(window, new MouseEvent("pointerup"));

    const bottomHandle = container.querySelector(".cursor-row-resize") as HTMLElement;
    fireEvent.pointerDown(bottomHandle, { clientY: 200 });
    fireEvent(window, new MouseEvent("pointermove", { clientY: 260 }));
    fireEvent(window, new MouseEvent("pointerup"));

    // The panes remain rendered after a drag interaction.
    expect(screen.getByTestId("context-pane")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-pane")).toBeInTheDocument();
  });

  it("honors a controlled bottom pane with a compact header and open state", async () => {
    const onOpenChange = vi.fn();
    render(
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          compactHeader: true,
          open: true,
          defaultHeight: 220,
          minHeight: 160,
          maxHeight: 360,
          onOpenChange,
          tabs: [{ id: "terminal", label: "Terminal", content: <div>Terminal content</div> }],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [{ id: "files", label: "Files", content: <div>Files content</div> }],
        }}
        primary={<div>Primary content</div>}
      />,
    );

    expect(screen.getByTestId("bottom-pane")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse bottom pane" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
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
              ariaLabel: "Specialist settings",
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
    await user.click(screen.getByRole("tab", { name: "Specialist settings" }));

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
