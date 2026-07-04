// Split out of FileManagerPage.tsx (issue #99).

import { searchFileManagerDirectories } from "@/lib/api";
import type { FileManagerNode, FileManagerRootKind } from "@cc/shared/schemas";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function MoveEntryDialog(props: {
  root: FileManagerRootKind;
  currentPath: string;
  node: FileManagerNode;
  destinationPath: string;
  busy: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState(props.destinationPath === "." ? "" : props.destinationPath);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const searching = loading || query !== debouncedQuery;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    void searchFileManagerDirectories({
      root: props.root,
      query: debouncedQuery,
      excludePath: props.node.path,
      limit: 200,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const filtered = result.directories.filter((path) => {
          if (path === props.node.path) {
            return false;
          }

          return !props.node.path.startsWith(`${path}/`);
        });

        setDirectories(filtered);
      })
      .catch(() => {
        if (!cancelled) {
          setDirectories(["."]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, props.node.path, props.root]);

  useEffect(() => {
    if (props.destinationPath.length === 0) {
      return;
    }

    setQuery(props.destinationPath === "." ? "" : props.destinationPath);
  }, [props.currentPath, props.destinationPath, props.node.path, props.root]);

  return (
    <ModalFrame ariaLabel="Move entry" onClose={props.onClose}>
      <form
        className="flex h-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Move {props.node.type}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Move `{props.node.name}` into another folder. Use `.` for the current root folder.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-4">
          <label className="grid gap-2 text-sm text-text-primary">
            <span>Destination folder</span>
            <span className="relative">
              <input
                aria-label="Search destination folders"
                autoFocus
                className="cc-input pr-10"
                onChange={(event) => {
                  setQuery(event.target.value);
                  props.onChange("");
                }}
                placeholder="Search folders from this root"
                value={query}
              />
              {searching ? (
                <RefreshCw
                  aria-label="Searching folders"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-secondary"
                />
              ) : null}
            </span>
          </label>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-elevated/60">
            {directories.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-text-secondary">No folders found.</p>
            ) : (
              directories.map((directory) => {
                const selected = props.destinationPath === directory;
                return (
                  <button
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                      selected
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                    }`}
                    key={directory}
                    onClick={() => {
                      props.onChange(directory);
                      setQuery(directory === "." ? "" : directory);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 truncate font-mono text-xs">
                      {directory === "." ? "/" : directory}
                    </span>
                    {selected ? <span className="text-xs font-medium">Selected</span> : null}
                  </button>
                );
              })
            )}
          </div>
          {props.destinationPath.trim().length > 0 ? (
            <p className="text-xs text-text-secondary">
              Selected destination: {props.destinationPath === "." ? "/" : props.destinationPath}
            </p>
          ) : (
            <p className="text-xs text-text-secondary">
              Choose a destination folder from the results.
            </p>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-4">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={props.busy || props.destinationPath.trim().length === 0}
            type="submit"
          >
            {props.busy ? "Moving..." : "Move"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function CreateEntryDialog(props: {
  type: "file" | "directory";
  name: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const label = props.type === "file" ? "file" : "folder";

  return (
    <ModalFrame ariaLabel={`Create ${label}`} onClose={props.onClose}>
      <form
        className="flex h-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Create {label}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Add a new {label} in the current location.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-4">
          <label className="grid gap-2 text-sm text-text-primary">
            <span>Name</span>
            <input
              aria-label="Name"
              autoFocus
              className="cc-input"
              onChange={(event) => props.onChange(event.target.value)}
              value={props.name}
            />
          </label>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-4">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={props.busy || props.name.trim().length === 0}
            type="submit"
          >
            {props.busy ? "Creating..." : `Create ${label}`}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function RenameEntryDialog(props: {
  node: FileManagerNode;
  name: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalFrame ariaLabel="Rename entry" onClose={props.onClose}>
      <form
        className="flex h-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Rename {props.node.type}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Update the name for `{props.node.name}`.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-4">
          <label className="grid gap-2 text-sm text-text-primary">
            <span>New name</span>
            <input
              aria-label="New name"
              autoFocus
              className="cc-input"
              onChange={(event) => props.onChange(event.target.value)}
              value={props.name}
            />
          </label>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-4">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={props.busy || props.name.trim().length === 0}
            type="submit"
          >
            {props.busy ? "Renaming..." : "Rename"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function DeleteEntryDialog(props: {
  node: FileManagerNode;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame ariaLabel="Delete entry" onClose={props.onClose}>
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Delete {props.node.type}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Delete `{props.node.name}`? This action cannot be undone.
          </p>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-4">
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="cc-button"
            disabled={props.busy}
            onClick={props.onConfirm}
            type="button"
          >
            {props.busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame(props: { ariaLabel: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-20"
      onClick={props.onClose}
    >
      <div
        aria-label={props.ariaLabel}
        className="w-full max-w-md rounded-md border border-border bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {props.children}
      </div>
    </div>
  );
}
