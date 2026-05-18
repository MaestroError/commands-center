import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageTimeline } from "./MessageTimeline";

import {
  HIDDEN_USER_MESSAGES,
  isHiddenUserMessage,
  isInterruptedMessage,
} from "./message-timeline-utils";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "hello",
    parts: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePart(overrides: Partial<ConversationPart> = {}): ConversationPart {
  return { id: "part-1", type: "text", text: "hello", ...overrides };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

let writeClipboardSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeClipboardSpy = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeClipboardSpy },
  });
});

describe("isHiddenUserMessage", () => {
  it.each([...HIDDEN_USER_MESSAGES])("returns true for hidden text %s", (hiddenText) => {
    const message = makeMessage({ role: "user", content: "" });
    const parts = [makePart({ text: hiddenText })];

    expect(isHiddenUserMessage(message, parts)).toBe(true);
  });

  it("returns false for arbitrary user text", () => {
    const message = makeMessage({ role: "user", content: "please summarize this" });

    expect(isHiddenUserMessage(message, [])).toBe(false);
  });
});

describe("isInterruptedMessage", () => {
  it("returns true when parts contain step-start but no step-finish", () => {
    const message = makeMessage({ role: "assistant" });
    const parts = [makePart({ type: "step-start" })];

    expect(isInterruptedMessage(message, parts)).toBe(true);
  });

  it.each(["interrupted", "aborted", "error"])(
    "returns true when step-finish reason is %s",
    (reason) => {
      const message = makeMessage({ role: "assistant" });
      const parts = [
        makePart({ type: "step-start" }),
        makePart({ id: "part-2", type: "step-finish", reason }),
      ];

      expect(isInterruptedMessage(message, parts)).toBe(true);
    },
  );

  it("returns false for a normal completed message", () => {
    const message = makeMessage({ role: "assistant" });
    const parts = [
      makePart({ type: "step-start" }),
      makePart({ id: "part-2", type: "step-finish", reason: "completed" }),
    ];

    expect(isInterruptedMessage(message, parts)).toBe(false);
  });
});

describe("MessageTimeline", () => {
  it("renders user messages right-aligned and assistant messages left-aligned", () => {
    const userMessage = makeMessage({ id: "user-1", role: "user", content: "User hello" });
    const assistantMessage = makeMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      parts: [makePart({ id: "assistant-text", text: "Assistant hello" })],
    });

    render(
      <MessageTimeline
        messages={[userMessage, assistantMessage]}
        parts={{ [assistantMessage.id]: assistantMessage.parts }}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.getByText("User hello").closest('div[class~="justify-end"]')).not.toBeNull();
    expect(
      screen.getByText("Assistant hello").closest('div[class~="justify-start"]'),
    ).not.toBeNull();
  });

  it('shows "Thinking..." when busy and the last message is from the user', () => {
    render(
      <MessageTimeline
        messages={[makeMessage({ id: "user-1", role: "user", content: "Waiting" })]}
        parts={{}}
        sessionStatus={{ type: "busy" }}
      />,
    );

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it('shows "Thinking..." when busy and there are no messages', () => {
    render(<MessageTimeline messages={[]} parts={{}} sessionStatus={{ type: "busy" }} />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it('does not show "Thinking..." when agentStatus is idle', () => {
    render(<MessageTimeline messages={[]} parts={{}} sessionStatus={{ type: "idle" }} />);

    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it('does not show "Thinking..." when the last message is from the assistant', () => {
    const assistantMessage = makeMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      parts: [makePart({ id: "assistant-text", text: "Reply" })],
    });

    render(
      <MessageTimeline
        messages={[assistantMessage]}
        parts={{ [assistantMessage.id]: assistantMessage.parts }}
        sessionStatus={{ type: "busy" }}
      />,
    );

    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("does not render hidden user messages", () => {
    const hiddenText = [...HIDDEN_USER_MESSAGES][0]!;
    const hiddenMessage = makeMessage({ id: "hidden-1", role: "user", content: "" });

    render(
      <MessageTimeline
        messages={[hiddenMessage]}
        parts={{ [hiddenMessage.id]: [makePart({ text: hiddenText })] }}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.queryByText(hiddenText)).not.toBeInTheDocument();
  });

  it("renders InterruptedDivider after an interrupted assistant message", () => {
    const interruptedMessage = makeMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      parts: [makePart({ id: "step-1", type: "step-start" })],
    });

    render(
      <MessageTimeline
        messages={[interruptedMessage]}
        parts={{ [interruptedMessage.id]: interruptedMessage.parts }}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
  });

  it("does not render InterruptedDivider for a normal completed message", () => {
    const completedMessage = makeMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      parts: [
        makePart({ id: "step-start", type: "step-start" }),
        makePart({ id: "step-finish", type: "step-finish", reason: "completed" }),
      ],
    });

    render(
      <MessageTimeline
        messages={[completedMessage]}
        parts={{ [completedMessage.id]: completedMessage.parts }}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.queryByText("Interrupted")).not.toBeInTheDocument();
  });

  it("forwards user attachment pill clicks", async () => {
    const user = userEvent.setup();
    const onAttachmentClick = vi.fn();
    const userMessage = makeMessage({
      id: "user-attachment",
      role: "user",
      content: "Please summarize this PDF",
      attachments: [
        {
          id: "att-1",
          type: "document",
          filename: "Carpenter Vacancy Redberry.pdf",
          mimeType: "application/pdf",
        },
      ],
    });

    render(
      <MessageTimeline
        sessionStatus={{ type: "idle" }}
        messages={[userMessage]}
        onAttachmentClick={onAttachmentClick}
        parts={{}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Carpenter Vacancy Redberry.pdf" }));

    expect(onAttachmentClick).toHaveBeenCalledWith("Carpenter Vacancy Redberry.pdf");
  });

  it("copies user message text", async () => {
    render(
      <MessageTimeline
        messages={[makeMessage({ id: "user-copy", role: "user", content: "Copy this" })]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(writeClipboardSpy).toHaveBeenCalledWith("Copy this");
  });

  it("calls convert to task for user messages", async () => {
    const message = makeMessage({ id: "user-task", role: "user", content: "Create task" });
    const onConvert = vi.fn();

    render(
      <MessageTimeline
        messages={[message]}
        onConvertUserMessageToTask={onConvert}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Convert to task" }));

    expect(onConvert).toHaveBeenCalledWith(message, []);
  });

  it("does not show convert to task for assistant messages", () => {
    render(
      <MessageTimeline
        messages={[makeMessage({ id: "assistant-task", role: "assistant", content: "Reply" })]}
        onConvertUserMessageToTask={vi.fn()}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Convert to task" })).not.toBeInTheDocument();
  });

  it("copies assistant text parts", async () => {
    const assistantMessage = makeMessage({
      id: "assistant-copy",
      role: "assistant",
      content: "",
      parts: [
        makePart({ id: "text-1", text: "First" }),
        makePart({ id: "text-2", text: "Second" }),
      ],
    });

    render(
      <MessageTimeline
        messages={[assistantMessage]}
        parts={{ [assistantMessage.id]: assistantMessage.parts }}
        sessionStatus={{ type: "idle" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(writeClipboardSpy).toHaveBeenCalledWith("First\n\nSecond");
  });

  it("renders retry status details instead of failing silently", () => {
    render(
      <MessageTimeline
        messages={[]}
        parts={{}}
        sessionStatus={{
          type: "retry",
          attempt: 2,
          message: "OpenAI rate limit reached",
          next: Date.now() + 5_000,
        }}
      />,
    );

    expect(screen.getByText("OpenAI rate limit reached")).toBeInTheDocument();
    expect(screen.getByText(/Retrying automatically/i)).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("renders a visible prompt send error", () => {
    render(
      <MessageTimeline
        messages={[]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
        sendError="Request failed with status 429."
      />,
    );

    expect(screen.getByText("Message failed to send")).toBeInTheDocument();
    expect(screen.getByText("Request failed with status 429.")).toBeInTheDocument();
  });
});
