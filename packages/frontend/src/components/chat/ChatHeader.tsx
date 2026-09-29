import { useState, type ReactNode } from "react";
import { History, Pencil, Plus, Terminal } from "lucide-react";

import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";

import { ConversationHistoryModal } from "./ConversationHistoryModal";

type ChatHeaderProps = {
  agentId: string;
  specialistName: string;
  specialistRole: string;
  agentIconPath?: string;
  currentConversationId: string;
  onStartFresh: () => void;
  onSelectConversation: (id: string) => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  quickEditorOpen?: boolean;
  quickEditorAvailable?: boolean;
  onToggleQuickEditor?: () => void;
  /** Rendered at the head of the action group; omitted when unavailable. */
  contextIndicator?: ReactNode;
};

export function ChatHeader({
  agentId,
  specialistName,
  specialistRole,
  agentIconPath,
  currentConversationId,
  onStartFresh,
  onSelectConversation,
  terminalOpen = false,
  onToggleTerminal,
  quickEditorOpen = false,
  quickEditorAvailable = false,
  onToggleQuickEditor,
  contextIndicator,
}: ChatHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 bg-surface">
      <div className="flex min-w-0 items-center gap-3">
        <SpecialistAvatar iconPath={agentIconPath} name={specialistName} size="md" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary truncate">{specialistName}</h2>
          <p className="text-xs text-text-secondary truncate">{specialistRole}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {contextIndicator}
        {/* Start Fresh */}
        <button
          aria-label="Start fresh conversation"
          type="button"
          title="Start fresh conversation"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={onStartFresh}
        >
          <Plus aria-hidden="true" size={15} />
        </button>

        {onToggleTerminal ? (
          <button
            aria-label="Workspace terminal"
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
            <Terminal aria-hidden="true" size={15} />
          </button>
        ) : null}

        {/* History */}
        <button
          aria-label="Conversation history"
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
          <History aria-hidden="true" size={15} />
        </button>

        {onToggleQuickEditor ? (
          <button
            aria-label="Quick editor"
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
            <Pencil aria-hidden="true" size={15} />
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
