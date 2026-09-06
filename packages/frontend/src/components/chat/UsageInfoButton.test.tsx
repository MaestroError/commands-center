import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { MessageUsageInfoButton, ToolUsageInfoButton, UsageInfoButton } from "./UsageInfoButton";

const rows = [
  { label: "Duration", value: "13s" },
  { label: "Total tokens", value: "47,335" },
  { label: "Started", value: "Jan 1, 00:00:00", detail: true },
];

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "assistant",
    content: "hi",
    parts: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:12.500Z",
    ...overrides,
  };
}

const stepFinish = {
  id: "prt-step",
  type: "step-finish",
  cost: 0,
  tokens: {
    total: 47_335,
    input: 46_890,
    output: 232,
    reasoning: 213,
    cache: { read: 0, write: 0 },
  },
} as ConversationPart;

describe("UsageInfoButton", () => {
  it("shows the figures on hover", async () => {
    const user = userEvent.setup();
    render(<UsageInfoButton label="Message tokens and timing" rows={rows} title="Message usage" />);

    await user.hover(screen.getByRole("button", { name: "Message tokens and timing" }));

    await waitFor(() => {
      expect(screen.getAllByText("47,335").length).toBeGreaterThan(0);
    });
  });

  it("opens a dialog with the same figures on click", async () => {
    const user = userEvent.setup();
    render(<UsageInfoButton label="Message tokens and timing" rows={rows} title="Message usage" />);

    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Message usage");
    expect(dialog).toHaveTextContent("47,335");
    expect(dialog).toHaveTextContent("13s");
  });

  it("closes the dialog again", async () => {
    const user = userEvent.setup();
    render(<UsageInfoButton label="Message tokens and timing" rows={rows} title="Message usage" />);

    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps timestamps out of the hover card but shows them in the dialog", async () => {
    const user = userEvent.setup();
    render(<UsageInfoButton label="Message tokens and timing" rows={rows} title="Message usage" />);

    await user.hover(screen.getByRole("button", { name: "Message tokens and timing" }));
    await waitFor(() => {
      expect(screen.getAllByText("47,335").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Started")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Started");
  });

  it("keeps a detail-only row set visible on hover", async () => {
    const user = userEvent.setup();
    render(
      <UsageInfoButton
        label="Timing for read"
        rows={[{ label: "Started", value: "Jan 1, 00:00:00", detail: true }]}
        title="read"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Timing for read" }));

    await waitFor(() => {
      expect(screen.getAllByText("Started").length).toBeGreaterThan(0);
    });
  });

  it("renders nothing when there is nothing to report", () => {
    const { container } = render(<UsageInfoButton label="Empty" rows={[]} title="Empty" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ToolUsageInfoButton", () => {
  it("renders timing for a tool call that has run", async () => {
    const user = userEvent.setup();
    const part = {
      id: "prt-tool",
      type: "tool",
      tool: "read",
      state: { status: "completed", time: { start: 1_782_898_078_071, end: 1_782_898_078_075 } },
    } as ConversationPart;

    render(<ToolUsageInfoButton part={part} toolName="read" />);
    await user.click(screen.getByRole("button", { name: "Timing for read" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("4ms");
  });

  it("renders nothing for a part with no timing", () => {
    const part = { id: "prt-tool", type: "tool", state: { status: "pending" } } as ConversationPart;
    const { container } = render(<ToolUsageInfoButton part={part} toolName="read" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("MessageUsageInfoButton", () => {
  it("reports tokens and duration for an assistant message", async () => {
    const user = userEvent.setup();
    render(<MessageUsageInfoButton message={makeMessage()} parts={[stepFinish]} />);

    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("47,335");
    expect(dialog).toHaveTextContent("46,890");
    expect(dialog).toHaveTextContent("13s");
  });

  it("renders nothing for a user message", () => {
    const { container } = render(
      <MessageUsageInfoButton message={makeMessage({ role: "user" })} parts={[stepFinish]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("sectioned rows", () => {
  it("groups rows under headings so unrelated figures cannot be read as one set", async () => {
    const user = userEvent.setup();
    render(
      <UsageInfoButton
        label="Context"
        rows={[
          { label: "Used", value: "56.8k", section: "Context window" },
          { label: "Limit", value: "200k", section: "Context window" },
          { label: "Total tokens", value: "57,353", section: "Burned in this chat" },
          { label: "Input", value: "55,446", section: "Burned in this chat" },
        ]}
        title="Context 56.8k / 200k (28%)"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Context" }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("Context window");
    expect(dialog).toHaveTextContent("Burned in this chat");
    // The heading appears once per group, not once per row.
    expect(screen.getAllByText("Context window")).toHaveLength(1);
    expect(screen.getAllByText("Burned in this chat")).toHaveLength(1);
  });
});
