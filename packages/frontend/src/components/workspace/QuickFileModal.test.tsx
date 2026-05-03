import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickFileModal } from "./QuickFileModal";

import type { UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";

vi.mock("./QuickInspectorSurface", () => ({
  QuickInspectorSurface: () => <div data-testid="quick-inspector-surface" />,
}));

const fileTab = {
  key: "file:readme",
  name: "README.md",
  tabType: "file" as const,
  root: "workspace" as const,
  path: "README.md",
  loading: false,
  dirty: false,
};

describe("QuickFileModal", () => {
  it("renders a visible close button", () => {
    render(
      <QuickFileModal
        controller={
          {
            open: true,
            tabs: [fileTab],
            activeKey: "file:readme",
            activeTab: fileTab,
            openFile: vi.fn(),
            openMedia: vi.fn(),
            openLiveRequest: vi.fn(),
            removeLiveRequest: vi.fn(),
            close: vi.fn(),
            setActive: vi.fn(),
            setOpen: vi.fn(),
            updateDraft: vi.fn(),
            reload: vi.fn(),
            save: vi.fn(),
          } satisfies UseChatInspectionTabs
        }
      />,
    );

    const button = screen.getByRole("button", { name: "Close quick editor" });

    expect(button).toBeVisible();
    expect(button).toHaveClass("bg-surface-elevated");
    expect(button).toHaveClass("text-text-primary");
  });
});
