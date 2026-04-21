import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

export const HIDDEN_USER_MESSAGES = new Set(["The following tool was executed by the user"]);

export function isHiddenUserMessage(msg: ConversationMessage, parts: ConversationPart[]): boolean {
  if (msg.role !== "user") return false;
  const textPart = parts.find((p) => p.type === "text");
  const text = ((textPart?.["text"] as string) || msg.content || "").trim();
  return HIDDEN_USER_MESSAGES.has(text);
}

export function isInterruptedMessage(
  msg: ConversationMessage,
  msgParts: ConversationPart[],
): boolean {
  if (msg.role !== "assistant") return false;
  const hasStepStart = msgParts.some((p) => p.type === "step-start");
  const stepFinish = msgParts.find((p) => p.type === "step-finish");
  if (stepFinish) {
    const reason = (stepFinish as Record<string, unknown>)["reason"] as string | undefined;
    return reason === "interrupted" || reason === "aborted" || reason === "error";
  }

  return hasStepStart && !stepFinish;
}
