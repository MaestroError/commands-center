import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { listConversations, deleteConversation } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type ConversationHistoryModalProps = {
  agentId: string;
  currentConversationId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

function relativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function ConversationHistoryModal({
  agentId,
  currentConversationId,
  onSelect,
  onClose,
}: ConversationHistoryModalProps) {
  const [search, setSearch] = useState("");
  /** ID of conversation pending delete confirmation, or "__all__" for clear-all */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: queryKeys.conversations(agentId),
    queryFn: () => listConversations(agentId),
  });

  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) => deleteConversation(agentId, conversationId),
    onSuccess: (_data, conversationId) => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(agentId) });
    },
  });

  const confirmDelete = (convId: string) => {
    setConfirmingId(null);
    setDeletingIds((prev) => new Set(prev).add(convId));
    deleteMutation.mutate(convId);
  };

  const confirmClearAll = () => {
    setConfirmingId(null);
    const toDelete = conversations.filter((c) => c.id !== currentConversationId);
    for (const conv of toDelete) {
      setDeletingIds((prev) => new Set(prev).add(conv.id));
      deleteMutation.mutate(conv.id);
    }
  };

  const filtered = conversations.filter((c) => {
    const title = (c.title ?? "Untitled").toLowerCase();
    return title.includes(search.toLowerCase());
  });

  const deletableCount = conversations.filter((c) => c.id !== currentConversationId).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-20"
      onClick={() => {
        setConfirmingId(null);
        onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-md border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Conversation history"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">History</h2>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 rounded-md bg-surface-elevated px-3 py-1.5">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-secondary shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-text-secondary hover:text-text-primary"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">
              {search ? "No matching conversations." : "No conversations yet."}
            </p>
          ) : (
            filtered.map((conv) => {
              const isCurrent = conv.id === currentConversationId;
              const isDeleting = deletingIds.has(conv.id);
              const isConfirming = confirmingId === conv.id;
              return (
                <div
                  key={conv.id}
                  className={["relative", isDeleting ? "opacity-40 pointer-events-none" : ""].join(
                    " ",
                  )}
                >
                  <button
                    type="button"
                    disabled={isDeleting}
                    className={[
                      "group w-full text-left flex items-center gap-3 px-4 py-2.5 transition",
                      isCurrent ? "bg-accent/8" : "hover:bg-surface-elevated",
                    ].join(" ")}
                    onClick={() => {
                      if (!isConfirming) {
                        onSelect(conv.id);
                        onClose();
                      }
                    }}
                  >
                    {isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {conv.title ?? "Untitled"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {relativeTime(conv.updatedAt)} · {conv.messageCount} message
                        {conv.messageCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {!isCurrent && !isConfirming && (
                      <button
                        type="button"
                        aria-label="Delete conversation"
                        className="invisible group-hover:visible flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-danger/10 hover:text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingId(conv.id);
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    )}
                  </button>

                  {/* Inline delete confirmation */}
                  {isConfirming && (
                    <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-surface-elevated px-4 py-2">
                      <span className="mr-auto text-xs text-text-secondary">
                        Delete this conversation?
                      </span>
                      <button
                        type="button"
                        className="rounded px-2.5 py-1 text-xs text-text-secondary transition hover:bg-surface hover:text-text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingId(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(conv.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {deletableCount > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            {confirmingId === "__all__" ? (
              <div className="flex items-center gap-2">
                <span className="mr-auto text-xs text-text-secondary">
                  Delete all {deletableCount} conversation{deletableCount !== 1 ? "s" : ""}?
                </span>
                <button
                  type="button"
                  className="rounded px-2.5 py-1 text-xs text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                  onClick={() => setConfirmingId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/20"
                  onClick={confirmClearAll}
                >
                  Delete all
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-text-secondary transition hover:text-danger"
                onClick={() => setConfirmingId("__all__")}
              >
                Clear all history ({deletableCount})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
