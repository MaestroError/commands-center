import { useEffect, useRef } from "react";
import { BookOpen, FileText, Folder } from "lucide-react";
import { useFilteredList } from "../../hooks/use-filtered-list";
import * as api from "../../lib/api";
import {
  isMentionableWorkspacePath,
  type FileMentionSelection,
  type MentionKind,
} from "./file-mention";

interface FileMentionPopoverProps {
  agentId?: string;
  query: string;
  onSelect: (selection: FileMentionSelection) => void;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  registerKeyHandler?: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
  position?: { top: number; left: number };
}

interface FileOption {
  path: string;
  display: string;
  subtitle?: string;
  kind: MentionKind;
  fullPath?: string;
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
            // Specialist scope: search the specialist's own workspace files, and
            // additionally surface shared global documents (which live outside the
            // specialist workspace and would never appear in a file search). The
            // two lookups are independent, so one failing must not drop the other.
            const [files, documents] = await Promise.all([
              api.searchAgentWorkspaceFiles(agentId, q).catch(() => [] as string[]),
              api.searchGlobalDocuments(q).catch(() => []),
            ]);

            const fileOptions: FileOption[] = files
              .filter(isMentionableWorkspacePath)
              .map((path) => ({ path, display: path, kind: "file" as const }));

            const documentOptions: FileOption[] = documents.map((doc) => ({
              path: doc.relativePath,
              display: doc.title,
              subtitle: `Global Document: ${doc.relativePath}`,
              kind: "global-document" as const,
              fullPath: doc.fullPath,
            }));

            return [...documentOptions, ...fileOptions];
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
      onSelect: (item) =>
        onSelect({
          path: item.path,
          filename: mentionFilename(item),
          kind: item.kind,
          fullPath: item.fullPath,
        }),
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
            {query.trim() ? "No results found" : "Type to search files and documents"}
          </div>
        ) : (
          filtered.map((item, index) => (
            <button
              key={`${item.kind}:${item.path}`}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm ${
                index === activeIndex
                  ? "bg-surface-elevated text-text-primary"
                  : "text-text-secondary hover:bg-surface-elevated"
              }`}
              onClick={() =>
                onSelect({
                  path: item.path,
                  filename: mentionFilename(item),
                  kind: item.kind,
                  fullPath: item.fullPath,
                })
              }
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

function mentionFilename(item: FileOption): string {
  if (item.kind === "global-document") {
    return item.display;
  }
  if (item.path.endsWith("/")) {
    return item.path;
  }
  return item.path.split("/").pop() ?? item.path;
}

function MentionIcon(props: { kind: FileOption["kind"]; isDirectory: boolean }) {
  if (props.kind === "document" || props.kind === "global-document") {
    return <BookOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
  }

  if (props.isDirectory) {
    return <Folder aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
  }

  return <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
}
