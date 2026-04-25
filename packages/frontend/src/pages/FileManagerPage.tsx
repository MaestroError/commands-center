import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, FilePlus, FolderPlus } from "lucide-react";

import type { FileManagerNode, FileManagerRootKind } from "@cc/shared/schemas";

import { CopyIdButton } from "@/components/chat/CopyIdButton";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import {
  createFileManagerEntry,
  deleteFileManagerEntry,
  listFileManagerNodes,
  renameFileManagerEntry,
} from "@/lib/api";

const ROOT_LABELS: Record<FileManagerRootKind, string> = {
  workspace: "Workspace",
  "all-agents": "All Agents",
  "host-filesystem": "Host Filesystem",
};

export function FileManagerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [root, setRoot] = useState<FileManagerRootKind>(() => getInitialRoot(searchParams));
  const [currentPath, setCurrentPath] = useState(() => searchParams.get("path") ?? ".");
  const [selectedPath, setSelectedPath] = useState(() => searchParams.get("select") ?? "");
  const [data, setData] = useState<{
    currentPath: string;
    absolutePath: string;
    sizeBytes?: number;
    lineCount?: number;
    nodes: FileManagerNode[];
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyAction, setBusyAction] = useState<string>();
  const [createType, setCreateType] = useState<"file" | "directory">();
  const [createValue, setCreateValue] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileManagerNode>();
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FileManagerNode>();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("root", root);
    if (currentPath !== ".") {
      params.set("path", currentPath);
    }
    if (selectedPath) {
      params.set("select", selectedPath);
    }
    setSearchParams(params, { replace: true });
  }, [currentPath, root, selectedPath, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void listFileManagerNodes({
      root,
      path: currentPath,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setData(response);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Failed to load files.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPath, root]);

  const selectedNode = useMemo(
    () => data?.nodes.find((node) => node.path === selectedPath),
    [data?.nodes, selectedPath],
  );
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentPath), [currentPath]);
  const visibleBreadcrumbs = useMemo(() => collapseBreadcrumbs(breadcrumbs), [breadcrumbs]);
  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);

  async function handleCreate(type: "file" | "directory") {
    const name = createValue.trim();

    if (name.length === 0) {
      return;
    }

    setBusyAction(`create-${type}`);
    setError(undefined);

    try {
      await createFileManagerEntry({
        root,
        parentPath: currentPath,
        name,
        type,
      });
      const response = await listFileManagerNodes({ root, path: currentPath });
      setData(response);
      setCreateType(undefined);
      setCreateValue("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Failed to create ${type}.`);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleRename(node: FileManagerNode) {
    if (node.isCritical) {
      return;
    }

    const name = renameValue.trim();

    if (name.length === 0 || name === node.name) {
      return;
    }

    setBusyAction(`rename-${node.path}`);
    setError(undefined);

    try {
      const response = await renameFileManagerEntry({
        root,
        path: node.path,
        name,
      });
      if (selectedPath === node.path) {
        setSelectedPath(response.path);
      }
      const nextListing = await listFileManagerNodes({ root, path: currentPath });
      setData(nextListing);
      setRenameTarget(undefined);
      setRenameValue("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to rename entry.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleDelete(node: FileManagerNode) {
    if (node.isCritical) {
      return;
    }

    setBusyAction(`delete-${node.path}`);
    setError(undefined);

    try {
      await deleteFileManagerEntry({ root, path: node.path });
      if (selectedPath === node.path) {
        setSelectedPath("");
      }
      const nextListing = await listFileManagerNodes({ root, path: currentPath });
      setData(nextListing);
      setDeleteTarget(undefined);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to delete entry.");
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <>
            <button
              className="cc-button cc-button-secondary"
              disabled={busyAction !== undefined}
              onClick={() => {
                setCreateType("file");
                setCreateValue("");
              }}
              type="button"
            >
              <FilePlus className="mr-2 h-4 w-4" />
              New file
            </button>
            <button
              className="cc-button cc-button-secondary"
              disabled={busyAction !== undefined}
              onClick={() => {
                setCreateType("directory");
                setCreateValue("");
              }}
              type="button"
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder
            </button>
          </>
        }
        description="Browse current agent workspaces, all agent folders, and the host filesystem from one dedicated workspace."
        eyebrow="File Manager"
        title="Browse and manage files"
      />
      <WorkspaceLayout
        contextPane={{
          title: "File details",
          tabs: [
            {
              id: "details",
              label: "Details",
              content: (
                <SelectionDetails
                  currentAbsolutePath={data?.absolutePath ?? "."}
                  currentPath={currentPath}
                  currentSizeBytes={data?.sizeBytes}
                  currentLineCount={data?.lineCount}
                  root={root}
                  selectedNode={selectedNode}
                />
              ),
            },
            {
              id: "actions",
              label: "Actions",
              content: (
                <SelectionActions
                  busyAction={busyAction}
                  onOpen={openNode}
                  onStartDelete={(node) => setDeleteTarget(node)}
                  onStartRename={(node) => {
                    setRenameTarget(node);
                    setRenameValue(node.name);
                  }}
                  selectedNode={selectedNode}
                />
              ),
            },
          ],
        }}
        primary={
          <div className="flex h-full min-h-[28rem] flex-col">
            <div className="border-b border-border px-4 py-4">
              <div className="flex flex-wrap gap-2">
                {(["workspace", "all-agents", "host-filesystem"] as const).map((option) => {
                  return (
                    <button
                      aria-pressed={root === option}
                      className={
                        root === option
                          ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                          : "rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:border-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      }
                      key={option}
                      onClick={() => {
                        setRoot(option);
                        setCurrentPath(".");
                        setSelectedPath("");
                      }}
                      type="button"
                    >
                      {ROOT_LABELS[option]}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-start justify-between gap-4 text-sm text-text-secondary">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <button
                    className="cc-button cc-button-secondary"
                    disabled={parentPath === undefined}
                    onClick={() => {
                      if (!parentPath) {
                        return;
                      }

                      setCurrentPath(parentPath);
                      setSelectedPath("");
                    }}
                    type="button"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </button>
                  <span className="font-medium text-text-primary">{ROOT_LABELS[root]}</span>
                  {visibleBreadcrumbs.map((crumb) => (
                    <div className="flex min-w-0 items-center gap-2" key={crumb.path}>
                      <span aria-hidden="true" className="text-text-secondary">
                        /
                      </span>
                      <button
                        className="max-w-[18rem] truncate rounded px-2 py-1 transition hover:bg-surface-elevated hover:text-text-primary"
                        onClick={() => {
                          setCurrentPath(crumb.path);
                          setSelectedPath("");
                        }}
                        title={crumb.label}
                        type="button"
                      >
                        {crumb.label}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2" aria-hidden="true" />
              </div>
            </div>
            {loading ? (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-text-secondary">
                Loading files...
              </div>
            ) : error ? (
              <div className="px-4 py-10 text-sm text-danger">{error}</div>
            ) : data && data.nodes.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="grid gap-2">
                  {data.nodes.map((node) => {
                    const isSelected = node.path === selectedPath;
                    const actionBusy = busyAction?.endsWith(node.path) ?? false;

                    return (
                      <div
                        aria-pressed={isSelected}
                        className={
                          isSelected
                            ? "flex items-center gap-3 rounded-xl border border-accent bg-accent/5 px-3 py-3"
                            : "flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3"
                        }
                        key={node.path}
                        onClick={() => setSelectedPath(node.path)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedPath(node.path);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg" aria-hidden="true">
                              {node.type === "directory" ? "📁" : "📄"}
                            </span>
                            {node.type === "directory" ? (
                              <button
                                className="truncate font-medium text-text-primary underline-offset-4 hover:underline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openNode(node);
                                }}
                                type="button"
                              >
                                {node.name}
                              </button>
                            ) : (
                              <span className="truncate font-medium text-text-primary">
                                {node.name}
                              </span>
                            )}
                            {node.isCritical ? (
                              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                Critical
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-text-secondary">
                            {node.path === "." ? "/" : node.path}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {node.type === "directory" ? (
                            <button
                              className="cc-button cc-button-secondary"
                              disabled={actionBusy}
                              onClick={(event) => {
                                event.stopPropagation();
                                openNode(node);
                              }}
                              type="button"
                            >
                              Open
                            </button>
                          ) : null}
                          {node.isCritical ? null : (
                            <>
                              <button
                                className="cc-button cc-button-secondary"
                                disabled={actionBusy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRenameTarget(node);
                                  setRenameValue(node.name);
                                }}
                                type="button"
                              >
                                Rename
                              </button>
                              <button
                                className="cc-button cc-button-secondary"
                                disabled={actionBusy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget(node);
                                }}
                                type="button"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-text-secondary">
                This folder is empty.
              </div>
            )}
          </div>
        }
      />
      {renameTarget ? (
        <RenameEntryDialog
          busy={busyAction === `rename-${renameTarget.path}`}
          name={renameValue}
          node={renameTarget}
          onChange={setRenameValue}
          onClose={() => {
            setRenameTarget(undefined);
            setRenameValue("");
          }}
          onSubmit={() => void handleRename(renameTarget)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteEntryDialog
          busy={busyAction === `delete-${deleteTarget.path}`}
          node={deleteTarget}
          onClose={() => setDeleteTarget(undefined)}
          onConfirm={() => void handleDelete(deleteTarget)}
        />
      ) : null}
      {createType ? (
        <CreateEntryDialog
          busy={busyAction === `create-${createType}`}
          name={createValue}
          type={createType}
          onChange={setCreateValue}
          onClose={() => {
            setCreateType(undefined);
            setCreateValue("");
          }}
          onSubmit={() => void handleCreate(createType)}
        />
      ) : null}
    </div>
  );

  function openNode(node: FileManagerNode) {
    if (node.type === "directory") {
      setCurrentPath(node.path);
      setSelectedPath("");
    }
  }
}

function SelectionDetails(props: {
  root: FileManagerRootKind;
  currentPath: string;
  currentAbsolutePath: string;
  currentSizeBytes?: number;
  currentLineCount?: number;
  selectedNode?: FileManagerNode;
}) {
  if (!props.selectedNode) {
    return (
      <div className="space-y-3 text-sm text-text-secondary">
        <p>Current location</p>
        <p className="rounded-lg border border-border bg-surface px-3 py-3 text-text-primary">
          {ROOT_LABELS[props.root]} / {props.currentPath === "." ? "" : props.currentPath}
        </p>
        <div>
          <p className="text-text-secondary">Path</p>
          <div className="mt-1">
            <DetailValue label="folder path" value={props.currentAbsolutePath} />
          </div>
        </div>
        <DetailMetric label="Size" value={formatSize(props.currentSizeBytes)} />
        {props.currentLineCount !== undefined ? (
          <DetailMetric label="Lines" value={formatLineCount(props.currentLineCount)} />
        ) : null}
        <p>Select a file to hand it off to the editor surface in the next sub-epic.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-text-secondary">Name</p>
        <p className="mt-1 font-medium text-text-primary">{props.selectedNode.name}</p>
      </div>
      <div>
        <p className="text-text-secondary">Type</p>
        <p className="mt-1 font-medium capitalize text-text-primary">{props.selectedNode.type}</p>
      </div>
      <div>
        <p className="text-text-secondary">Path</p>
        <div className="mt-1">
          <DetailValue
            label={`${props.selectedNode.type} path`}
            value={props.selectedNode.absolutePath}
          />
        </div>
      </div>
      <DetailMetric label="Size" value={formatSize(props.selectedNode.sizeBytes)} />
      {props.selectedNode.lineCount !== undefined ? (
        <DetailMetric label="Lines" value={formatLineCount(props.selectedNode.lineCount)} />
      ) : null}
      {props.selectedNode.isCritical ? (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-3 text-amber-800 dark:text-amber-200">
          {props.selectedNode.criticalReason}
        </div>
      ) : null}
      {props.selectedNode.type === "file" ? (
        <p className="text-text-secondary">This file selection is ready for the editor surface.</p>
      ) : null}
    </div>
  );
}

function SelectionActions(props: {
  selectedNode?: FileManagerNode;
  busyAction?: string;
  onOpen: (node: FileManagerNode) => void;
  onStartRename: (node: FileManagerNode) => void;
  onStartDelete: (node: FileManagerNode) => void;
}) {
  if (!props.selectedNode) {
    return (
      <p className="text-sm text-text-secondary">Select a file or folder to rename or delete it.</p>
    );
  }

  const actionBusy = props.busyAction?.endsWith(props.selectedNode.path) ?? false;

  return (
    <div className="flex flex-col gap-2">
      {props.selectedNode.type === "directory" ? (
        <button
          className="cc-button cc-button-secondary"
          disabled={actionBusy}
          onClick={() => props.onOpen(props.selectedNode!)}
          type="button"
        >
          Open directory
        </button>
      ) : null}
      {props.selectedNode.isCritical ? null : (
        <>
          <button
            className="cc-button cc-button-secondary"
            disabled={actionBusy}
            onClick={() => props.onStartRename(props.selectedNode!)}
            type="button"
          >
            Rename {props.selectedNode.type}
          </button>
          <button
            className="cc-button cc-button-secondary"
            disabled={actionBusy}
            onClick={() => props.onStartDelete(props.selectedNode!)}
            type="button"
          >
            Delete {props.selectedNode.type}
          </button>
        </>
      )}
    </div>
  );
}

function getInitialRoot(searchParams: URLSearchParams): FileManagerRootKind {
  const requested = searchParams.get("root");

  if (requested === "workspace" || requested === "all-agents" || requested === "host-filesystem") {
    return requested;
  }

  return "workspace";
}

function buildBreadcrumbs(currentPath: string): Array<{ label: string; path: string }> {
  const crumbs = [{ label: "root", path: "." }];

  if (currentPath === ".") {
    return crumbs;
  }

  const segments = currentPath.split(/[\\/]/).filter(Boolean);
  let activePath = "";

  for (const segment of segments) {
    activePath = activePath === "" ? segment : `${activePath}/${segment}`;
    crumbs.push({ label: segment, path: activePath });
  }

  return crumbs;
}

function collapseBreadcrumbs(
  breadcrumbs: Array<{ label: string; path: string }>,
): Array<{ label: string; path: string }> {
  const root = breadcrumbs[0];

  if (!root) {
    return [];
  }

  const segments = breadcrumbs.slice(1);

  if (segments.length <= 3) {
    return [root, ...segments];
  }

  const firstVisibleIndex = segments.length - 3;
  const hiddenJumpTarget = segments[firstVisibleIndex - 1];

  if (!hiddenJumpTarget) {
    return [root, ...segments.slice(-3)];
  }

  return [root, { label: "...", path: hiddenJumpTarget.path }, ...segments.slice(-3)];
}

function getParentPath(currentPath: string): string | undefined {
  if (currentPath === ".") {
    return undefined;
  }

  const segments = currentPath.split(/[\\/]/).filter(Boolean);

  if (segments.length <= 1) {
    return ".";
  }

  return segments.slice(0, -1).join("/");
}

function DetailValue(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all font-medium text-text-primary">{props.value}</p>
        <CopyIdButton
          className="shrink-0 rounded-md p-1.5"
          label={props.label}
          value={props.value}
        />
      </div>
    </div>
  );
}

function DetailMetric(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-text-secondary">{props.label}</p>
      <p className="mt-1 font-medium text-text-primary">{props.value}</p>
    </div>
  );
}

function formatSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) {
    return "Unknown";
  }

  return `${(sizeBytes / 1024).toFixed(sizeBytes < 1024 ? 1 : 0)} KB`;
}

function formatLineCount(lineCount: number): string {
  return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}

function CreateEntryDialog(props: {
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

function RenameEntryDialog(props: {
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

function DeleteEntryDialog(props: {
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
