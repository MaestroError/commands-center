import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";

type AssistantMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
};

function renderPart(part: ConversationPart) {
  switch (part.type) {
    case "text":
      return <Markdown content={(part["text"] as string) ?? ""} />;
    case "tool":
      return <ToolCallCard part={part} />;
    default:
      return <p className="text-xs text-text-secondary italic">[{part.type}]</p>;
  }
}

export function AssistantMessage({ message, parts }: AssistantMessageProps) {
  const hasParts = parts.length > 0;

  return (
    <div className="bg-chat-agent rounded-2xl px-4 py-3 space-y-3">
      {hasParts ? (
        parts.map((part) => <div key={part.id}>{renderPart(part)}</div>)
      ) : (
        <Markdown content={message.content} />
      )}
    </div>
  );
}
