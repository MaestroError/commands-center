import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { AssistantMessage } from "./AssistantMessage";
import { InterruptedDivider } from "./InterruptedDivider";
import { UserMessage } from "./UserMessage";

type MessageTimelineProps = {
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
  agentStatus: "idle" | "busy" | "retry";
};

// System-generated user messages that should not be shown as chat bubbles
const HIDDEN_USER_MESSAGES = new Set(["The following tool was executed by the user"]);

function isHiddenUserMessage(msg: ConversationMessage, parts: ConversationPart[]): boolean {
  if (msg.role !== "user") return false;
  const textPart = parts.find((p) => p.type === "text");
  const text = ((textPart?.["text"] as string) || msg.content || "").trim();
  return HIDDEN_USER_MESSAGES.has(text);
}

function isInterruptedMessage(msg: ConversationMessage, msgParts: ConversationPart[]): boolean {
  if (msg.role !== "assistant") return false;
  const hasStepStart = msgParts.some((p) => p.type === "step-start");
  const stepFinish = msgParts.find((p) => p.type === "step-finish");
  if (stepFinish) {
    const reason = (stepFinish as Record<string, unknown>)["reason"] as string | undefined;
    return reason === "interrupted" || reason === "aborted" || reason === "error";
  }
  // Has step-start but no step-finish = interrupted mid-stream
  return hasStepStart && !stepFinish;
}

export function MessageTimeline({ messages, parts, agentStatus }: MessageTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > 40);
  }, []);

  useEffect(() => {
    if (!userScrolledUp) {
      scrollToBottom();
    }
  }, [messages, agentStatus, userScrolledUp, scrollToBottom]);

  const lastMessage = messages.at(-1);
  const showThinking =
    agentStatus === "busy" && (lastMessage?.role === "user" || messages.length === 0);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto flex-1 min-h-0 px-4 py-4 space-y-4"
      onScroll={handleScroll}
    >
      {messages.map((msg) => {
        const msgParts = parts[msg.id] ?? msg.parts;
        // Skip empty assistant message shells (no parts yet, no content)
        if (msg.role === "assistant" && msgParts.length === 0 && !msg.content) {
          return null;
        }
        // Skip system-generated user messages
        if (isHiddenUserMessage(msg, msgParts)) {
          return null;
        }
        const interrupted = isInterruptedMessage(msg, msgParts);
        return (
          <div key={msg.id}>
            <div className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={msg.role === "user" ? "max-w-[80%]" : "max-w-[90%]"}>
                {msg.role === "user" ? (
                  <UserMessage message={msg} parts={msgParts} />
                ) : (
                  <AssistantMessage message={msg} parts={msgParts} />
                )}
              </div>
            </div>
            {interrupted && <InterruptedDivider />}
          </div>
        );
      })}

      {showThinking ? (
        <div className="flex justify-start">
          <div className="bg-chat-agent rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span
                className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse"
                style={{ animationDelay: "300ms" }}
              />
              <span className="ml-2 text-sm text-text-secondary">Thinking...</span>
            </div>
          </div>
        </div>
      ) : null}

      <div ref={sentinelRef} />
    </div>
  );
}
