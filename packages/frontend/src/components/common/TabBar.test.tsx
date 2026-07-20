import { useState } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TabBar } from "@/components/common/TabBar";

const TABS = [
  { id: "files", label: "Files" },
  { id: "search", label: "Search" },
  { id: "git", label: "Git" },
];

const ICON_TABS = [
  { id: "files", label: "Files" },
  {
    id: "settings",
    label: "Settings",
    ariaLabel: "Specialist settings",
    iconOnly: true,
    icon: <span>gear</span>,
  },
];

describe("TabBar", () => {
  it("renders all tabs", () => {
    render(<TabBar tabs={TABS} activeTabId="files" onTabChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Git" })).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected", () => {
    render(<TabBar tabs={TABS} activeTabId="search" onTabChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Git" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onTabChange with the correct id when a tab is clicked", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<TabBar tabs={TABS} activeTabId="files" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Search" }));

    expect(onTabChange).toHaveBeenCalledOnce();
    expect(onTabChange).toHaveBeenCalledWith("search");
  });

  it("preserves the callback contract when the active tab is clicked again", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<TabBar tabs={TABS} activeTabId="files" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Files" }));

    expect(onTabChange).toHaveBeenCalledOnce();
    expect(onTabChange).toHaveBeenCalledWith("files");
  });

  it("renders a scrollable tablist container", () => {
    render(<TabBar tabs={TABS} activeTabId="files" onTabChange={vi.fn()} />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("overflow-x-auto");
  });

  it("renders with no active tab when activeTabId is undefined", () => {
    render(<TabBar tabs={TABS} onTabChange={vi.fn()} />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-selected", "false");
    }
  });

  it("renders an empty tablist when no tabs are provided", () => {
    render(<TabBar tabs={[]} activeTabId="files" onTabChange={vi.fn()} />);

    expect(screen.getByRole("tablist")).toBeEmptyDOMElement();
  });

  it("supports icon-only tabs with accessible labels", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    render(<TabBar tabs={ICON_TABS} activeTabId="files" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Specialist settings" }));

    expect(onTabChange).toHaveBeenCalledWith("settings");
    expect(screen.getByRole("tab", { name: "Specialist settings" })).toBeInTheDocument();
  });

  it("uses arrow keys and Home/End for roving focus with automatic activation", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    function ControlledTabBar() {
      const [activeTabId, setActiveTabId] = useState("files");

      return (
        <TabBar
          tabs={TABS}
          activeTabId={activeTabId}
          onTabChange={(tabId) => {
            onTabChange(tabId);
            setActiveTabId(tabId);
          }}
        />
      );
    }

    render(<ControlledTabBar />);

    const files = screen.getByRole("tab", { name: "Files" });
    files.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Search" })).toHaveFocus();
    expect(onTabChange).toHaveBeenLastCalledWith("search");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Git" })).toHaveFocus();
    expect(onTabChange).toHaveBeenLastCalledWith("git");

    await user.keyboard("{Home}");
    expect(files).toHaveFocus();
    expect(onTabChange).toHaveBeenLastCalledWith("files");
  });

  it("emits panel relationships only when a panel id is provided", () => {
    render(
      <TabBar
        activeTabId="files"
        onTabChange={vi.fn()}
        tabs={[
          { id: "files", label: "Files", panelId: "files-panel", triggerId: "files-trigger" },
          { id: "search", label: "Search" },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute(
      "aria-controls",
      "files-panel",
    );
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("id", "files-trigger");
    expect(screen.getByRole("tab", { name: "Search" })).not.toHaveAttribute("aria-controls");
  });
});
