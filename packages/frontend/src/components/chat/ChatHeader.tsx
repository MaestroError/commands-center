import { useState } from "react";

import type { ConversationSummary } from "@cc/shared/schemas";

import { ConversationList } from "./ConversationList";

type ChatHeaderProps = {
  agentName: string;
  agentRole: string;
  previousConversations: ConversationSummary[];
  currentConversationId: string;
  onStartFresh: () => void;
  onSelectConversation: (id: string) => void;
};

export function ChatHeader({
  agentName,
  agentRole,
  previousConversations,
  currentConversationId,
  onStartFresh,
  onSelectConversation,
}: ChatHeaderProps) {
  const [showPrevious, setShowPrevious] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 bg-surface">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-text-primary truncate">{agentName}</h2>
        <p className="text-xs text-text-secondary truncate">{agentRole}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Start Fresh */}
        <button
          type="button"
          title="Start fresh conversation"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={onStartFresh}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>

        {/* Previous conversations */}
        <div className="relative">
          <button
            type="button"
            title="Previous conversations"
            className={[
              "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition",
              showPrevious
                ? "bg-surface-elevated text-text-primary"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            ].join(" ")}
            onClick={() => setShowPrevious((prev) => !prev)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showPrevious ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showPrevious ? (
            <ConversationList
              conversations={previousConversations}
              currentId={currentConversationId}
              onSelect={onSelectConversation}
              onClose={() => setShowPrevious(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
