import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationList } from "./ConversationList";

import type { ConversationSummary } from "@cc/shared/schemas";

const dateNowSpy = vi.spyOn(Date, "now");

afterEach(() => {
  dateNowSpy.mockReset();
});

describe("ConversationList", () => {
  it("renders an empty state when there are no previous conversations", () => {
    render(
      <ConversationList
        conversations={[]}
        currentId="conv-1"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("No previous conversations.")).toBeInTheDocument();
  });

  it("renders relative timestamps and selects a conversation", () => {
    dateNowSpy.mockReturnValue(new Date("2026-05-05T12:00:00.000Z").getTime());

    const onSelect = vi.fn();
    const onClose = vi.fn();
    const conversations = [
      {
        id: "conv-1",
        agentId: "agent-1",
        opencodeSessionId: "session-1",
        title: "Latest",
        status: "active",
        source: "chat",
        isCurrent: true,
        messageCount: 3,
        createdAt: "2026-05-05T11:59:50.000Z",
        updatedAt: "2026-05-05T11:59:50.000Z",
      },
      {
        id: "conv-2",
        agentId: "agent-1",
        opencodeSessionId: "session-2",
        status: "archived",
        source: "chat",
        isCurrent: false,
        messageCount: 12,
        createdAt: "2026-05-03T12:00:00.000Z",
        updatedAt: "2026-05-03T12:00:00.000Z",
      },
    ] satisfies ConversationSummary[];

    render(
      <ConversationList
        conversations={conversations}
        currentId="conv-1"
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("2d ago")).toBeInTheDocument();
    expect(screen.getByText("Untitled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Untitled/ }));

    expect(onSelect).toHaveBeenCalledWith("conv-2");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
