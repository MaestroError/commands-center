import { useEffect, useRef } from "react";
import { useFilteredList } from "../../hooks/use-filtered-list";
import * as api from "../../lib/api";
import { isMentionableWorkspacePath } from "./file-mention";

interface FileMentionPopoverProps {
  agentId?: string;
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
  subtitle?: string;
  kind: "file" | "directory" | "document";
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
          if (agentId) {
            const files = await api.searchAgentWorkspaceFiles(agentId, q);
            return files
              .filter(isMentionableWorkspacePath)
              .map((path) => ({ path, display: path, kind: "file" as const }));
          }

          const result = await api.searchWorkspaceFiles(q);
          const fileOptions: FileOption[] = result.nameMatches
            .map((match) => match.path)
            .filter(isMentionableWorkspacePath)
            .map((path) => ({ path, display: path, kind: "file" as const }));

          const documentOptions: FileOption[] = (result.documentMatches ?? []).map((doc) => ({
            path: `Documents/${doc.relativePath}`,
            display: doc.title,
            subtitle: `Documents/${doc.relativePath}`,
            kind: "document" as const,
          }));

          return [...documentOptions, ...fileOptions];
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
        position ? { top: position.top, left: position.left } : { top: "calc(100% + 4px)", left: 0 }
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
            {query.trim() ? "No results found" : "Type to search files and documents"}
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
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <MentionIcon kind={item.kind} isDirectory={item.path.endsWith("/")} />
                <span className="min-w-0 truncate">
                  {item.display}
                  {item.subtitle ? (
                    <span className="ml-1.5 text-text-secondary">{item.subtitle}</span>
                  ) : null}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function MentionIcon(props: { kind: FileOption["kind"]; isDirectory: boolean }) {
  if (props.kind === "document") {
    return (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-secondary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    );
  }

  if (props.isDirectory) {
    return (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-secondary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-text-secondary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
