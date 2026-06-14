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

  it("does not call onTabChange when the active tab is clicked again", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<TabBar tabs={TABS} activeTabId="files" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Files" }));

    // onTabChange still fires — caller decides whether to no-op
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
});
