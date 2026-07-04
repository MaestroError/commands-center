import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { AssistantMessage } from "./AssistantMessage";

function buildMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    ...overrides,
  } as ConversationMessage;
}

function toolPart(id: string, tool: string, status = "completed"): ConversationPart {
  return { id, type: "tool", tool, state: { status } } as ConversationPart;
}

describe("AssistantMessage", () => {
  it("renders text, grouped context tools, generic and error tool parts", () => {
    const parts: ConversationPart[] = [
      { id: "t1", type: "text", text: "Working on it" } as ConversationPart,
      toolPart("c1", "read"),
      toolPart("c2", "glob"),
      toolPart("g1", "mysterytool"),
      toolPart("e1", "bash", "error"),
      toolPart("h1", "todowrite"),
      { id: "u1", type: "step-start" } as ConversationPart,
    ];

    render(<AssistantMessage message={buildMessage()} parts={parts} />);

    expect(screen.getByText("Working on it")).toBeInTheDocument();
  });

  it("renders the error box when the message errored with no parts or content", () => {
    render(
      <AssistantMessage
        message={buildMessage({ error: { name: "Error", message: "Something broke" } })}
        parts={[]}
      />,
    );

    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("renders plain markdown content when there are no parts", () => {
    render(<AssistantMessage message={buildMessage({ content: "Just a reply" })} parts={[]} />);

    expect(screen.getByText("Just a reply")).toBeInTheDocument();
  });

  it("falls back to content and error when all parts are hidden", () => {
    render(
      <AssistantMessage
        message={buildMessage({
          content: "Fallback body",
          error: { name: "Error", message: "and an error" },
        })}
        parts={[toolPart("h1", "todowrite")]}
      />,
    );

    expect(screen.getByText("Fallback body")).toBeInTheDocument();
    expect(screen.getByText("and an error")).toBeInTheDocument();
  });

  it("renders nothing when parts are all hidden and there is no content or error", () => {
    const { container } = render(
      <AssistantMessage message={buildMessage()} parts={[toolPart("h1", "todowrite")]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
