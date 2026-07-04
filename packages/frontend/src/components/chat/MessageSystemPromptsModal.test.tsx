import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageSystemPromptsModal } from "./MessageSystemPromptsModal";

const mockQuery = vi.fn<(id?: string) => unknown>();
vi.mock("@/hooks/use-conversation-system-prompts-query", () => ({
  useConversationSystemPromptsQuery: (conversationId?: string) => mockQuery(conversationId),
}));

type Message = React.ComponentProps<typeof MessageSystemPromptsModal>["message"];

type Prompt = {
  id: string;
  title: string;
  renderedBody: string;
  enabled: boolean;
};

function prompt(p: Prompt) {
  return {
    description: "",
    scope: "chat" as const,
    danger: false,
    optional: false,
    isCustomized: false,
    ...p,
  };
}

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "assistant",
    parts: [],
    ...overrides,
  } as Message;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("MessageSystemPromptsModal", () => {
  it("renders the captured snapshot when the message has one", () => {
    mockQuery.mockReturnValue({ isLoading: false, data: [] });

    render(
      <MessageSystemPromptsModal
        message={buildMessage({
          systemPromptSnapshot: [
            prompt({ id: "sp-1", title: "Base", renderedBody: "You are helpful.", enabled: true }),
          ],
        })}
        conversationId="conv-1"
        onClose={vi.fn()}
      />,
    );

    // The snapshot path passes the message's captured prompts to the modal.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    // The fallback query is skipped when a snapshot exists.
    expect(mockQuery).toHaveBeenCalledWith(undefined);
  });

  it("shows the fallback loading state while resolving current prompts", () => {
    mockQuery.mockReturnValue({ isLoading: true, data: undefined });

    render(
      <MessageSystemPromptsModal
        message={buildMessage()}
        conversationId="conv-1"
        onClose={vi.fn()}
      />,
    );

    expect(mockQuery).toHaveBeenCalledWith("conv-1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the enabled fallback prompts once the query resolves", () => {
    mockQuery.mockReturnValue({
      isLoading: false,
      data: [
        prompt({ id: "sp-1", title: "Active", renderedBody: "Do the thing.", enabled: true }),
        prompt({ id: "sp-2", title: "Disabled", renderedBody: "ignored", enabled: false }),
        prompt({ id: "sp-3", title: "Blank", renderedBody: "   ", enabled: true }),
      ],
    });

    render(
      <MessageSystemPromptsModal
        message={buildMessage()}
        conversationId="conv-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
    expect(screen.queryByText("Blank")).not.toBeInTheDocument();
  });
});
