import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Search } from "lucide-react";

import { searchWorkspaceFiles } from "@/lib/api";

import { isImagePath } from "./document-asset";

type WorkspaceFilePickerDialogProps = {
  onClose: () => void;
  onSelect: (path: string) => void;
};

export function WorkspaceFilePickerDialog(props: WorkspaceFilePickerDialogProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  const filesQuery = useQuery({
    queryKey: ["workspace-file-picker", deferredQuery],
    queryFn: () => searchWorkspaceFiles(deferredQuery),
    enabled: deferredQuery.length > 0,
  });

  const matches = filesQuery.data?.nameMatches ?? [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-app-bg/80 px-4 pt-24 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <section
        aria-label="Reference a workspace file"
        aria-modal="true"
        className="cc-panel w-full max-w-xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-secondary" />
            <input
              aria-label="Search workspace files"
              autoFocus
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onClose();
                }
              }}
              placeholder="Search workspace files to reference…"
              type="text"
              value={query}
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1">
          {deferredQuery.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">
              Type to search files anywhere in the workspace. Images are embedded; other files are
              linked to the File Manager.
            </p>
          ) : filesQuery.isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">Searching…</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">No files found.</p>
          ) : (
            <ul aria-label="Workspace file results">
              {matches.map((match) => {
                const image = isImagePath(match.path);
                return (
                  <li key={match.path}>
                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition hover:bg-surface-elevated"
                      onClick={() => props.onSelect(match.path)}
                      type="button"
                    >
                      {image ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {match.path}
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-secondary">
                        {image ? "Image" : "Link"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
