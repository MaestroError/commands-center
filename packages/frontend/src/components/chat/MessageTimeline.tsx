import { Check, ClipboardList, Copy, MoreVertical, ScrollText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationMessage, ConversationPart, SessionStatus } from "@cc/shared/schemas";

import { AssistantMessage } from "./AssistantMessage";
import { InterruptedDivider } from "./InterruptedDivider";
import { MessageSystemPromptsModal } from "./MessageSystemPromptsModal";
import { UserMessage } from "./UserMessage";
import { isHiddenUserMessage, isInterruptedMessage } from "./message-timeline-utils";

type MessageTimelineProps = {
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
  sessionStatus: SessionStatus;
  sendError?: string | null;
  conversationId?: string;
  onAttachmentClick?: (filename: string) => void;
  onConvertUserMessageToTask?: (message: ConversationMessage, parts: ConversationPart[]) => void;
};

export function MessageTimeline({
  messages,
  parts,
  sessionStatus,
  sendError,
  conversationId,
  onAttachmentClick,
  onConvertUserMessageToTask,
}: MessageTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [promptsModalMessage, setPromptsModalMessage] = useState<ConversationMessage | null>(null);

  const scrollToBottom = useCallback(() => {
    // Scroll the timeline container itself rather than scrollIntoView on a
    // sentinel: scrollIntoView also scrolls every scrollable ancestor (including
    // the overflow-hidden chat container), which shoves the composer off-screen.
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
      className="overflow-y-auto flex-1 min-h-0 bg-app-bg px-4 py-4 space-y-4"
      onScroll={handleScroll}
    >
      {messages.map((msg) => {
        const msgParts = parts[msg.id] ?? msg.parts;
        const copyText = getMessageCopyText(msg, msgParts);
        // Skip empty assistant message shells (no parts yet, no content)
        if (msg.role === "assistant" && msgParts.length === 0 && !msg.content && !msg.error) {
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
              <div
                className={
                  msg.role === "user" ? "group min-w-0 max-w-[80%]" : "group min-w-0 max-w-[90%]"
                }
              >
                <div className="flex items-start gap-2">
                  {msg.role === "user" ? (
                    <div className="flex gap-1">
                      <MessageCopyButton copyText={copyText} />
                      <UserMessageMenu
                        onConvert={
                          onConvertUserMessageToTask
                            ? () => onConvertUserMessageToTask(msg, msgParts)
                            : undefined
                        }
                        onShowSystemPrompts={() => setPromptsModalMessage(msg)}
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
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
                  {msg.role !== "user" ? <MessageCopyButton copyText={copyText} /> : null}
                </div>
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

      {promptsModalMessage ? (
        <MessageSystemPromptsModal
          message={promptsModalMessage}
          conversationId={conversationId}
          onClose={() => setPromptsModalMessage(null)}
        />
      ) : null}
    </div>
  );
}

function UserMessageMenu(props: { onConvert?: () => void; onShowSystemPrompts: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Message actions"
        aria-haspopup="true"
        aria-expanded={open}
        className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-secondary transition hover:border-accent/50 hover:text-text-primary focus:opacity-100 group-hover:opacity-100 ${
          open ? "opacity-100" : "opacity-30"
        }`}
        onClick={() => setOpen((value) => !value)}
        title="Message actions"
        type="button"
      >
        <MoreVertical aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        // A simple popover of buttons — not an ARIA menu (no arrow-key/focus model).
        <div className="absolute right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
          {props.onConvert ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary transition hover:bg-surface-elevated"
              onClick={() => {
                setOpen(false);
                props.onConvert?.();
              }}
            >
              <ClipboardList aria-hidden="true" className="h-3.5 w-3.5 text-text-secondary" />
              Convert to task
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary transition hover:bg-surface-elevated"
            onClick={() => {
              setOpen(false);
              props.onShowSystemPrompts();
            }}
          >
            <ScrollText aria-hidden="true" className="h-3.5 w-3.5 text-text-secondary" />
            Check system prompts
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MessageCopyButton(props: { copyText: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!props.copyText) {
    return null;
  }

  const handleClick = () => {
    void navigator.clipboard
      .writeText(props.copyText)
      .then(() => {
        setCopied(true);
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, 2000);
      })
      .catch(() => undefined);
  };

  return (
    <button
      aria-label={copied ? "Copied" : "Copy message"}
      className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-secondary opacity-30 transition hover:border-accent/50 hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
      onClick={handleClick}
      title={copied ? "Copied!" : "Copy message"}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function getMessageCopyText(message: ConversationMessage, parts: ConversationPart[]): string {
  const textParts = parts
    .filter((part) => part.type === "text" && typeof part["text"] === "string")
    .map((part) => part["text"] as string)
    .filter((text) => text.trim().length > 0);

  if (textParts.length > 0) {
    return textParts.join("\n\n");
  }

  return message.content;
}
