import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

type UserMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
};

export function UserMessage({ message, parts }: UserMessageProps) {
  // Get text from parts first (SSE events deliver text via parts),
  // fall back to message.content (from initial hydration)
  const textPart = parts.find((p) => p.type === "text");
  const text = (textPart?.["text"] as string) || message.content || "";

  return (
    <div className="bg-chat-user rounded-2xl px-4 py-3 whitespace-pre-wrap text-sm text-text-primary">
      {text}
    </div>
  );
}
