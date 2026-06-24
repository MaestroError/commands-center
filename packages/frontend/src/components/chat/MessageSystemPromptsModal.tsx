import type { ConversationMessage } from "@cc/shared/schemas";

import { useConversationSystemPromptsQuery } from "@/hooks/use-conversation-system-prompts-query";

import { SystemPromptsModal } from "./SystemPromptsModal";

type MessageSystemPromptsModalProps = {
  message: ConversationMessage;
  conversationId?: string;
  onClose: () => void;
};

/**
 * Decides what the "Show system prompts" modal renders for a message: the exact
 * snapshot captured at send time when present, otherwise the conversation's
 * current resolved prompts as a labelled fallback (older messages predate the
 * snapshot).
 */
export function MessageSystemPromptsModal({
  message,
  conversationId,
  onClose,
}: MessageSystemPromptsModalProps) {
  const hasSnapshot = Boolean(message.systemPromptSnapshot);
  const fallbackQuery = useConversationSystemPromptsQuery(hasSnapshot ? undefined : conversationId);

  if (hasSnapshot) {
    return <SystemPromptsModal prompts={message.systemPromptSnapshot ?? []} onClose={onClose} />;
  }

  if (fallbackQuery.isLoading) {
    return <SystemPromptsModal prompts={[]} isFallback onClose={onClose} />;
  }

  const fallbackPrompts = (fallbackQuery.data ?? []).filter(
    (prompt) => prompt.enabled && prompt.renderedBody.trim().length > 0,
  );

  return <SystemPromptsModal prompts={fallbackPrompts} isFallback onClose={onClose} />;
}
