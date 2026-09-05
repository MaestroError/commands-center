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
  Element.prototype.scrollTo = vi.fn();
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

    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Convert to task" }));

    expect(onConvert).toHaveBeenCalledWith(message, []);
  });

  it("opens the actions menu and checks system prompts for user messages", async () => {
    const message = makeMessage({ id: "user-prompts", role: "user", content: "Hi" });

    render(
      <MessageTimeline
        messages={[message]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
        conversationId="conv-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.getByRole("button", { name: "Check system prompts" })).toBeInTheDocument();
    // No convert handler provided → that item is hidden.
    expect(screen.queryByRole("button", { name: "Convert to task" })).not.toBeInTheDocument();
  });

  it("does not show the actions menu for assistant messages", () => {
    render(
      <MessageTimeline
        messages={[makeMessage({ id: "assistant-task", role: "assistant", content: "Reply" })]}
        onConvertUserMessageToTask={vi.fn()}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Message actions" })).not.toBeInTheDocument();
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

  it("renders an empty assistant message when it has an error", () => {
    render(
      <MessageTimeline
        messages={[
          makeMessage({
            id: "assistant-error",
            role: "assistant",
            content: "",
            error: {
              name: "APIError",
              message: "The image data you provided does not represent a valid image.",
            },
          }),
        ]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(
      screen.getByText("The image data you provided does not represent a valid image."),
    ).toBeInTheDocument();
  });
});

describe("usage info buttons", () => {
  // A message shaped like real OpenCode output: one step-finish carrying the
  // token counts, one tool part carrying its own start/end timing.
  const stepFinish = makePart({
    id: "prt-step",
    type: "step-finish",
    reason: "tool-calls",
    cost: 0,
    tokens: {
      total: 47_335,
      input: 46_890,
      output: 232,
      reasoning: 213,
      cache: { read: 0, write: 0 },
    },
  } as Partial<ConversationPart>);

  // `bash` renders as its own row; `read`/`grep` would be folded into the
  // collapsed "Gathered context" group instead.
  const toolPart = makePart({
    id: "prt-tool",
    type: "tool",
    tool: "bash",
    callID: "call-1",
    state: {
      status: "completed",
      title: "bash",
      input: { command: "ls" },
      output: "ok",
      metadata: {},
      time: { start: 1_782_898_078_071, end: 1_782_898_078_075 },
    },
  } as Partial<ConversationPart>);

  function renderTimeline() {
    const message = makeMessage({
      id: "assistant-usage",
      role: "assistant",
      content: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:12.500Z",
    });

    render(
      <MessageTimeline
        messages={[message]}
        parts={{ "assistant-usage": [stepFinish, toolPart] }}
        sessionStatus={{ type: "idle" }}
      />,
    );
  }

  it("reports message tokens and duration from the step-finish part", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("47,335");
    expect(dialog).toHaveTextContent("13s");
  });

  it("reports per-tool timing from the tool part", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: "Timing for Shell" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("4ms");
  });

  it("gives user messages no usage button", () => {
    render(
      <MessageTimeline
        messages={[makeMessage({ id: "user-1", role: "user", content: "hi" })]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Message tokens and timing" })).toBeNull();
  });
});

describe("older message paging", () => {
  it("offers the load control only when older messages remain", () => {
    const { rerender } = render(
      <MessageTimeline messages={[makeMessage()]} parts={{}} sessionStatus={{ type: "idle" }} />,
    );
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();

    rerender(
      <MessageTimeline
        hasMoreMessages
        messages={[makeMessage()]}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Load older messages" })).toBeInTheDocument();
  });

  it("requests the previous page when the control is used", async () => {
    const user = userEvent.setup();
    const onLoadOlderMessages = vi.fn();
    render(
      <MessageTimeline
        hasMoreMessages
        messages={[makeMessage()]}
        onLoadOlderMessages={onLoadOlderMessages}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load older messages" }));

    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("shows progress and blocks a second request while a page is in flight", async () => {
    const user = userEvent.setup();
    const onLoadOlderMessages = vi.fn();
    render(
      <MessageTimeline
        hasMoreMessages
        loadingOlderMessages
        messages={[makeMessage()]}
        onLoadOlderMessages={onLoadOlderMessages}
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    const button = screen.getByRole("button", { name: "Loading older messages…" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("surfaces a failed page load", () => {
    render(
      <MessageTimeline
        hasMoreMessages
        messages={[makeMessage()]}
        olderMessagesError="Request failed."
        parts={{}}
        sessionStatus={{ type: "idle" }}
      />,
    );

    expect(screen.getByText("Request failed.")).toBeInTheDocument();
  });
});
