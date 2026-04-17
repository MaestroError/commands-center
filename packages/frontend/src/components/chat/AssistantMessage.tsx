import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";

type AssistantMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
};

// Internal part types that should not be rendered as visible content
const HIDDEN_PART_TYPES = new Set(["step-start", "step-finish", "reasoning", "patch", "input"]);

function renderPart(part: ConversationPart) {
  if (HIDDEN_PART_TYPES.has(part.type)) {
    return null;
  }

  switch (part.type) {
    case "text":
      return <Markdown content={(part["text"] as string) ?? ""} />;
    case "tool":
      return <ToolCallCard part={part} />;
    default:
      return null;
  }
}

export function AssistantMessage({ message, parts }: AssistantMessageProps) {
  const hasParts = parts.length > 0;

  return (
    <div className="bg-chat-agent rounded-2xl px-4 py-3 space-y-3">
      {hasParts ? (
        parts.map((part) => {
          const rendered = renderPart(part);
          if (!rendered) return null;
          return <div key={part.id}>{rendered}</div>;
        })
      ) : (
        <Markdown content={message.content} />
      )}
    </div>
  );
}
