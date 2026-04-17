import { useEffect, useRef } from "react";
import { useFilteredList } from "../../hooks/use-filtered-list";
import * as api from "../../lib/api";

interface FileMentionPopoverProps {
  agentId: string;
  query: string;
  onSelect: (path: string) => void;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  registerKeyHandler?: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
  position?: { top: number; left: number };
}

interface FileOption {
  path: string;
  display: string;
}

export function FileMentionPopover({
  agentId,
  query,
  onSelect,
  onClose,
  onKeyDown: parentOnKeyDown,
  registerKeyHandler,
  position,
}: FileMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const { filtered, isLoading, activeIndex, setActiveIndex, onKeyDown, setQuery } =
    useFilteredList<FileOption>({
      items: async (q) => {
        if (!q.trim()) {
          return [];
        }
        try {
          const files = await api.searchWorkspaceFiles(agentId, q);
          return files.map((path) => ({ path, display: path }));
        } catch {
          return [];
        }
      },
      filterKey: "display",
      onSelect: (item) => onSelect(item.path),
      onClose,
    });

  // Register key handler for parent forwarding
  useEffect(() => {
    registerKeyHandler?.(onKeyDown);
    return () => registerKeyHandler?.(null);
  }, [registerKeyHandler, onKeyDown]);

  // Sync query from parent
  useEffect(() => {
    setQuery(query);
  }, [query, setQuery]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && filtered.length > 0) {
      const activeElement = listRef.current.children[activeIndex] as HTMLElement | undefined;
      activeElement?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown(e)) {
      return;
    }
    parentOnKeyDown(e);
  };

  return (
    <div
      className="absolute z-[100] max-h-64 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      style={
        position
          ? { top: position.top, left: position.left }
          : { bottom: "calc(100% + 4px)", left: 0 }
      }
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-border px-3 py-2 text-xs text-text-secondary">
        File mention
      </div>
      <div ref={listRef} className="max-h-52 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">Searching...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">
            {query.trim() ? "No files found" : "Type to search files"}
          </div>
        ) : (
          filtered.map((item, index) => (
            <button
              key={item.path}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm ${
                index === activeIndex
                  ? "bg-surface-elevated text-text-primary"
                  : "text-text-secondary hover:bg-surface-elevated"
              }`}
              onClick={() => onSelect(item.path)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-mono text-xs">{item.display}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
