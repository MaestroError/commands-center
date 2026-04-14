import { useState } from "react";

import type { ConversationSummary } from "@cc/shared/schemas";

import { ConversationList } from "./ConversationList";

type ChatHeaderProps = {
  agentName: string;
  conversationTitle?: string;
  previousConversations: ConversationSummary[];
  currentConversationId: string;
  onStartFresh: () => void;
  onSelectConversation: (id: string) => void;
};

export function ChatHeader({
  agentName,
  conversationTitle,
  previousConversations,
  currentConversationId,
  onStartFresh,
  onSelectConversation,
}: ChatHeaderProps) {
  const [showPrevious, setShowPrevious] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 bg-surface">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-text-primary truncate">{agentName}</h2>
        <p className="text-sm text-text-secondary truncate">
          {conversationTitle ?? "New conversation"}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className="cc-button-secondary" onClick={onStartFresh}>
          Start Fresh
        </button>

        <div className="relative">
          <button
            type="button"
            className="cc-button-secondary"
            onClick={() => setShowPrevious((prev) => !prev)}
          >
            Previous {showPrevious ? "▴" : "▾"}
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
