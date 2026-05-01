import { useState } from "react";

import { AgentAvatar } from "@/components/agents/agent-avatar";

import { ConversationHistoryModal } from "./ConversationHistoryModal";

type ChatHeaderProps = {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentIconPath?: string;
  currentConversationId: string;
  onStartFresh: () => void;
  onSelectConversation: (id: string) => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  quickEditorOpen?: boolean;
  quickEditorAvailable?: boolean;
  onToggleQuickEditor?: () => void;
};

export function ChatHeader({
  agentId,
  agentName,
  agentRole,
  agentIconPath,
  currentConversationId,
  onStartFresh,
  onSelectConversation,
  terminalOpen = false,
  onToggleTerminal,
  quickEditorOpen = false,
  quickEditorAvailable = false,
  onToggleQuickEditor,
}: ChatHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 bg-surface">
      <div className="flex min-w-0 items-center gap-3">
        <AgentAvatar iconPath={agentIconPath} name={agentName} size="md" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary truncate">{agentName}</h2>
          <p className="text-xs text-text-secondary truncate">{agentRole}</p>
        </div>
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
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>

        {onToggleTerminal ? (
          <button
            type="button"
            title="Workspace terminal"
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md transition",
              terminalOpen
                ? "bg-surface-elevated text-text-primary"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            ].join(" ")}
            onClick={onToggleTerminal}
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
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" x2="20" y1="19" y2="19" />
            </svg>
          </button>
        ) : null}

        {/* History */}
        <button
          type="button"
          title="Conversation history"
          className={[
            "flex h-8 w-8 items-center justify-center rounded-md transition",
            showHistory
              ? "bg-surface-elevated text-text-primary"
              : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
          ].join(" ")}
          onClick={() => setShowHistory(true)}
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
        </button>

        {onToggleQuickEditor ? (
          <button
            aria-pressed={quickEditorOpen}
            disabled={!quickEditorAvailable}
            type="button"
            title="Quick editor"
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-50",
              quickEditorOpen
                ? "bg-surface-elevated text-text-primary"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            ].join(" ")}
            onClick={onToggleQuickEditor}
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
        ) : null}
      </div>

      {showHistory && (
        <ConversationHistoryModal
          agentId={agentId}
          currentConversationId={currentConversationId}
          onSelect={onSelectConversation}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
