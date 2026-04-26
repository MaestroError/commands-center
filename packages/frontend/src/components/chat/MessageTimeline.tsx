import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationMessage, ConversationPart, SessionStatus } from "@cc/shared/schemas";

import { AssistantMessage } from "./AssistantMessage";
import { InterruptedDivider } from "./InterruptedDivider";
import { UserMessage } from "./UserMessage";
import { isHiddenUserMessage, isInterruptedMessage } from "./message-timeline-utils";

type MessageTimelineProps = {
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
  sessionStatus: SessionStatus;
  sendError?: string | null;
  onAttachmentClick?: (filename: string) => void;
};

export function MessageTimeline({
  messages,
  parts,
  sessionStatus,
  sendError,
  onAttachmentClick,
}: MessageTimelineProps) {
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
  }, [messages, sessionStatus, sendError, userScrolledUp, scrollToBottom]);

  const lastMessage = messages.at(-1);
  const showThinking =
    sessionStatus.type === "busy" && (lastMessage?.role === "user" || messages.length === 0);
  const retrySeconds =
    sessionStatus.type === "retry"
      ? Math.max(0, Math.round((sessionStatus.next - Date.now()) / 1000))
      : 0;

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
                  <UserMessage
                    message={msg}
                    onAttachmentClick={onAttachmentClick}
                    parts={msgParts}
                  />
                ) : (
                  <AssistantMessage message={msg} parts={msgParts} />
                )}
              </div>
            </div>
            {interrupted && <InterruptedDivider />}
          </div>
        );
      })}

      {sessionStatus.type === "retry" ? (
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
            <p className="text-sm text-text-primary">{sessionStatus.message}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Retrying automatically{retrySeconds > 0 ? ` in ${String(retrySeconds)}s` : " soon"}.
              Attempt {String(sessionStatus.attempt)}.
            </p>
          </div>
        </div>
      ) : null}

      {sendError ? (
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="text-sm font-medium text-text-primary">Message failed to send</p>
            <p className="mt-1 text-xs text-text-secondary">{sendError}</p>
          </div>
        </div>
      ) : null}

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
