import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChatHeader } from "./ChatHeader";

vi.mock("./ConversationHistoryModal", () => ({
  ConversationHistoryModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="conversation-history-modal">
      <span>Mock history modal</span>
      <button type="button" onClick={onClose}>
        Close modal
      </button>
    </div>
  ),
}));

function renderHeader(overrides: Partial<React.ComponentProps<typeof ChatHeader>> = {}) {
  const props: React.ComponentProps<typeof ChatHeader> = {
    agentId: "agent-1",
    specialistName: "Planner",
    specialistRole: "Plans implementation work",
    agentIconPath: undefined,
    currentConversationId: "conv-1",
    onStartFresh: vi.fn(),
    onSelectConversation: vi.fn(),
    ...overrides,
  };

  return { ...render(<ChatHeader {...props} />), props };
}

describe("ChatHeader", () => {
  it("renders the specialistName as the primary label", () => {
    renderHeader();

    expect(screen.getByRole("heading", { name: "Planner" })).toBeInTheDocument();
  });

  it("renders the specialistRole as the subtitle", () => {
    renderHeader();

    expect(screen.getByText("Plans implementation work")).toBeInTheDocument();
  });

  it("renders emoji avatars when provided", () => {
    renderHeader({ agentIconPath: "emoji:🤖" });

    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("opens ConversationHistoryModal when the history button is clicked", () => {
    renderHeader();

    fireEvent.click(screen.getByTitle("Conversation history"));

    expect(screen.getByTestId("conversation-history-modal")).toBeInTheDocument();
  });

  it("hides the modal after closing it", () => {
    renderHeader();

    fireEvent.click(screen.getByTitle("Conversation history"));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    expect(screen.queryByTestId("conversation-history-modal")).not.toBeInTheDocument();
  });

  it("calls onStartFresh when the start-fresh button is clicked", () => {
    const onStartFresh = vi.fn();
    renderHeader({ onStartFresh });

    fireEvent.click(screen.getByTitle("Start fresh conversation"));

    expect(onStartFresh).toHaveBeenCalled();
  });

  it("calls onToggleTerminal when the terminal button is clicked", () => {
    const onToggleTerminal = vi.fn();
    renderHeader({ onToggleTerminal });

    fireEvent.click(screen.getByTitle("Workspace terminal"));

    expect(onToggleTerminal).toHaveBeenCalled();
  });

  it("calls onToggleQuickEditor when the quick editor button is clicked", () => {
    const onToggleQuickEditor = vi.fn();
    renderHeader({ onToggleQuickEditor, quickEditorAvailable: true });

    fireEvent.click(screen.getByTitle("Quick editor"));

    expect(onToggleQuickEditor).toHaveBeenCalled();
  });

  it("disables the quick editor button when no file is available", () => {
    renderHeader({ onToggleQuickEditor: vi.fn(), quickEditorAvailable: false });

    expect(screen.getByTitle("Quick editor")).toBeDisabled();
  });
});
