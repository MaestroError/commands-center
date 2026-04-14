import type { ConversationSummary } from "@cc/shared/schemas";

type ConversationListProps = {
  conversations: ConversationSummary[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function ConversationList({
  conversations,
  currentId,
  onSelect,
  onClose,
}: ConversationListProps) {
  return (
    <div className="absolute top-full left-0 z-10 mt-1 w-72 border border-border rounded-xl bg-surface shadow-lg max-h-64 overflow-y-auto">
      {conversations.length === 0 ? (
        <p className="p-3 text-sm text-text-secondary">No previous conversations.</p>
      ) : (
        conversations.map((conv) => (
          <button
            key={conv.id}
            type="button"
            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent/5 transition ${
              conv.id === currentId ? "bg-accent/10" : ""
            }`}
            onClick={() => {
              onSelect(conv.id);
              onClose();
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">
                {conv.title ?? "Untitled"}
              </p>
              <p className="text-xs text-text-secondary">{relativeTime(conv.updatedAt)}</p>
            </div>
            <span className="cc-badge text-xs shrink-0">{conv.messageCount}</span>
          </button>
        ))
      )}
    </div>
  );
}
