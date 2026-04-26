import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorTabBar } from "./EditorTabBar";
import type { EditorTab } from "@/hooks/use-editor-tabs";

function buildTab(overrides: Partial<EditorTab> & { key: string; path: string }): EditorTab {
  return {
    root: "workspace",
    name: overrides.path.split("/").pop() ?? overrides.path,
    loading: false,
    dirty: false,
    ...overrides,
  };
}

describe("EditorTabBar", () => {
  it("renders nothing when there are no tabs", () => {
    const { container } = render(
      <EditorTabBar tabs={[]} onActivate={() => {}} onClose={() => {}} onMove={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a tab per file with its name", () => {
    const tabs: EditorTab[] = [
      buildTab({ key: "workspace:a.ts", path: "a.ts" }),
      buildTab({ key: "workspace:b.ts", path: "b.ts" }),
    ];
    render(
      <EditorTabBar
        tabs={tabs}
        activeKey="workspace:a.ts"
        onActivate={() => {}}
        onClose={() => {}}
        onMove={() => {}}
      />,
    );
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
  });

  it("clicking a tab calls onActivate with its key", () => {
    const onActivate = vi.fn();
    const tabs = [
      buildTab({ key: "workspace:a.ts", path: "a.ts" }),
      buildTab({ key: "workspace:b.ts", path: "b.ts" }),
    ];
    render(
      <EditorTabBar
        tabs={tabs}
        activeKey="workspace:a.ts"
        onActivate={onActivate}
        onClose={() => {}}
        onMove={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("editor-tab-workspace:b.ts"));
    expect(onActivate).toHaveBeenCalledWith("workspace:b.ts");
  });

  it("clicking the × button calls onClose without onActivate", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const tabs = [buildTab({ key: "workspace:a.ts", path: "a.ts" })];
    render(
      <EditorTabBar
        tabs={tabs}
        activeKey="workspace:a.ts"
        onActivate={onActivate}
        onClose={onClose}
        onMove={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("editor-tab-close-workspace:a.ts"));
    expect(onClose).toHaveBeenCalledWith("workspace:a.ts");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("middle-click on a tab calls onClose", () => {
    const onClose = vi.fn();
    const tabs = [buildTab({ key: "workspace:a.ts", path: "a.ts" })];
    render(
      <EditorTabBar
        tabs={tabs}
        activeKey="workspace:a.ts"
        onActivate={() => {}}
        onClose={onClose}
        onMove={() => {}}
      />,
    );
    fireEvent(
      screen.getByTestId("editor-tab-workspace:a.ts"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledWith("workspace:a.ts");
  });

  it("renders a dirty dot for tabs with unsaved changes", () => {
    const tabs = [buildTab({ key: "workspace:a.ts", path: "a.ts", dirty: true })];
    render(
      <EditorTabBar
        tabs={tabs}
        activeKey="workspace:a.ts"
        onActivate={() => {}}
        onClose={() => {}}
        onMove={() => {}}
      />,
    );
    expect(screen.getByTestId("editor-tab-dirty-workspace:a.ts")).toBeInTheDocument();
  });
});
