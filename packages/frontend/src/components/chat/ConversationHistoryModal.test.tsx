import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConversationHistoryModal } from "./ConversationHistoryModal";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
}));

const mockConversations = [
  {
    id: "conv-1",
    agentId: "agent-1",
    opencodeSessionId: "sess-1",
    status: "active" as const,
    source: "chat" as const,
    isCurrent: true,
    title: "First conversation",
    messageCount: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "conv-2",
    agentId: "agent-1",
    opencodeSessionId: "sess-2",
    status: "active" as const,
    source: "chat" as const,
    isCurrent: false,
    title: "Second conversation",
    messageCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: "conv-3",
    agentId: "agent-1",
    opencodeSessionId: "sess-3",
    status: "active" as const,
    source: "chat" as const,
    isCurrent: false,
    title: "Third conversation",
    messageCount: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const defaultProps = {
  agentId: "agent-1",
  currentConversationId: "conv-1",
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.mocked(api.listConversations).mockClear();
  vi.mocked(api.deleteConversation).mockClear();
  vi.mocked(api.listConversations).mockResolvedValue(mockConversations);
  vi.mocked(api.deleteConversation).mockResolvedValue(undefined);
  defaultProps.onSelect.mockClear();
  defaultProps.onClose.mockClear();
});

describe("ConversationHistoryModal", () => {
  it("renders loading state initially", () => {
    vi.mocked(api.listConversations).mockReturnValue(new Promise(() => {}));
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders conversation list after load", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("First conversation")).toBeInTheDocument());
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
    expect(screen.getByText("Third conversation")).toBeInTheDocument();
  });

  it("filters conversations by search query", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("First conversation"));

    fireEvent.change(screen.getByPlaceholderText("Search conversations..."), {
      target: { value: "second" },
    });

    expect(screen.queryByText("First conversation")).not.toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
    expect(screen.queryByText("Third conversation")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no matches", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("First conversation"));

    fireEvent.change(screen.getByPlaceholderText("Search conversations..."), {
      target: { value: "xyz-no-match" },
    });

    expect(screen.getByText("No matching conversations.")).toBeInTheDocument();
  });

  it("calls onSelect and onClose when clicking a conversation", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("Second conversation"));

    fireEvent.click(screen.getByText("Second conversation"));

    expect(defaultProps.onSelect).toHaveBeenCalledWith("conv-2");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking the backdrop", async () => {
    const user = userEvent.setup();
    render(<ConversationHistoryModal {...defaultProps} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => screen.getByText("First conversation"));

    const backdrop = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls deleteConversation after confirming the delete prompt", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("Second conversation"));

    const deleteButtons = screen.getAllByLabelText("Delete conversation");
    fireEvent.click(deleteButtons[0]!);

    // Confirmation row appears
    expect(screen.getByText("Delete this conversation?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteConversation).toHaveBeenCalledWith("agent-1", "conv-2"));
  });

  it("does not delete when confirmation is cancelled", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("Second conversation"));

    const deleteButtons = screen.getAllByLabelText("Delete conversation");
    fireEvent.click(deleteButtons[0]!);

    expect(screen.getByText("Delete this conversation?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete this conversation?")).not.toBeInTheDocument();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });

  it("does not show delete button for current conversation", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("First conversation"));

    // 2 deletable conversations (conv-2 and conv-3), not conv-1 (current)
    const deleteButtons = screen.getAllByLabelText("Delete conversation");
    expect(deleteButtons).toHaveLength(2);
  });

  it("shows clear all button with correct count and calls delete for all non-current after confirmation", async () => {
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("First conversation"));

    expect(screen.getByText("Clear all history (2)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear all history (2)"));

    // Confirmation row appears
    expect(screen.getByRole("button", { name: "Delete all" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() => {
      expect(api.deleteConversation).toHaveBeenCalledWith("agent-1", "conv-2");
      expect(api.deleteConversation).toHaveBeenCalledWith("agent-1", "conv-3");
    });
    expect(api.deleteConversation).not.toHaveBeenCalledWith("agent-1", "conv-1");
  });

  it("preserves the existing no-Escape dismissal contract", async () => {
    const user = userEvent.setup();
    render(<ConversationHistoryModal {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByText("First conversation"));

    await user.keyboard("{Escape}");

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });
});
