import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePenLine, FilePlus2, FolderPlus, FolderSearch, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  connectWorkspaceEvents,
  createFileManagerEntry,
  deleteFileManagerEntry,
  getWorkspaceTree,
  moveFileManagerEntry,
  uploadFileManagerEntries,
  type FileNode,
} from "@/lib/api";
import { resolveSpecialistWorkspacePath } from "@/lib/specialist-workspace-path";
import { buildFileManagerHref } from "@/lib/file-manager-href";
import { extractDroppedUploadableFiles, toFileManagerUploadEntries } from "@/lib/file-transfer";

type WorkspaceFilesTabProps = {
  agentId: string;
  agentSlug: string;
  onOpenFile?: (path: string) => void;
  onAddArtifact?: (file: { name: string; path: string }) => Promise<void>;
};

type TreeNodeProps = {
  node: FileNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  childrenByPath: Record<string, FileNode[]>;
  actionBusyKey?: string;
  pendingArtifactPaths: Set<string>;
  dropTargetPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
  onOpenLocation: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onAddArtifact?: (file: { name: string; path: string }) => Promise<void>;
  onDeleteNode: (node: FileNode) => Promise<void>;
  onToggleDirectory: (path: string) => Promise<void>;
  onDropExternalFiles: (
    event: React.DragEvent<HTMLElement>,
    destinationPath: string,
  ) => Promise<void>;
  onMoveNode: (sourcePath: string, destinationPath: string) => Promise<void>;
  onDragTargetChange: (path: string | null) => void;
};

export function WorkspaceFilesTab({
  agentId,
  agentSlug,
  onOpenFile,
  onAddArtifact,
}: WorkspaceFilesTabProps) {
  const navigate = useNavigate();
  const [roots, setRoots] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [childrenByPath, setChildrenByPath] = useState<Record<string, FileNode[]>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderValue, setCreateFolderValue] = useState("");
  const [actionBusyKey, setActionBusyKey] = useState<string>();
  const [pendingArtifactPaths, setPendingArtifactPaths] = useState<Set<string>>(() => new Set());
  const [artifactStatus, setArtifactStatus] = useState<{
    message: string;
    type: "error" | "success";
  }>();
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedPathsRef = useRef(expandedPaths);
  const refreshingRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    expandedPathsRef.current = expandedPaths;
  }, [expandedPaths]);

  const openLocation = useCallback(
    (path: string) => {
      void navigate(
        buildFileManagerHref({ path: resolveSpecialistWorkspacePath(agentSlug, path) }),
      );
    },
    [agentSlug, navigate],
  );

  const refreshTree = useCallback(async () => {
    if (refreshingRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshingRef.current = true;
    setRefreshing(true);

    try {
      const expanded = Array.from(expandedPathsRef.current);
      const rootNodes = await getWorkspaceTree(agentId);
      const childEntries = await Promise.all(
        expanded.map(async (path) => {
          try {
            return [path, await getWorkspaceTree(agentId, path)] as const;
          } catch {
            return [path, null] as const;
          }
        }),
      );

      const visibleRootNodes = filterVisibleNodes(rootNodes);
      const nextChildrenByPath: Record<string, FileNode[]> = {};
      const visiblePaths = new Set(visibleRootNodes.map((node) => node.path));

      for (const [path, children] of childEntries) {
        if (!children) {
          continue;
        }

        const visibleChildren = filterVisibleNodes(children);

        if (visibleChildren.length === 0) {
          continue;
        }

        nextChildrenByPath[path] = visibleChildren;
        for (const child of visibleChildren) {
          visiblePaths.add(child.path);
        }
      }

      const nextExpanded = new Set(
        expanded.filter((path) => visiblePaths.has(path) && nextChildrenByPath[path] !== undefined),
      );

      setRoots(visibleRootNodes);
      setChildrenByPath(nextChildrenByPath);
      setExpandedPaths(nextExpanded);
      setLoading(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
      setLoading(false);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refreshTree();
      }
    }
  }, [agentId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setRoots(null);
    setChildrenByPath({});
    setExpandedPaths(new Set());
    setLoadingPaths(new Set());
    setCreatingFolder(false);
    setCreateFolderValue("");
    void refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    const abortController = new AbortController();

    const consume = async () => {
      try {
        for await (const event of connectWorkspaceEvents(agentId, abortController.signal)) {
          if (event.type !== "workspace.changed") {
            continue;
          }

          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
          }

          refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            void refreshTree();
          }, 350);
        }
      } catch (nextError) {
        if (!abortController.signal.aborted) {
          console.warn("[workspace-files] failed to subscribe to workspace changes", nextError);
        }
      }
    };

    void consume();

    return () => {
      abortController.abort();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [agentId, refreshTree]);

  const toggleDirectory = useCallback(
    async (path: string) => {
      if (expandedPathsRef.current.has(path)) {
        setExpandedPaths((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
        return;
      }

      if (childrenByPath[path] === undefined) {
        setLoadingPaths((current) => new Set(current).add(path));
        try {
          const nodes = await getWorkspaceTree(agentId, path);
          setChildrenByPath((current) => ({ ...current, [path]: filterVisibleNodes(nodes) }));
        } finally {
          setLoadingPaths((current) => {
            const next = new Set(current);
            next.delete(path);
            return next;
          });
        }
      }

      setExpandedPaths((current) => new Set(current).add(path));
    },
    [agentId, childrenByPath],
  );

  const handleCreateFolder = useCallback(async () => {
    const name = createFolderValue.trim();
    if (name.length === 0) {
      return;
    }

    setActionBusyKey("create-folder");
    setError(null);

    try {
      await createFileManagerEntry({
        root: "workspace",
        parentPath: resolveSpecialistWorkspacePath(agentSlug, "."),
        name,
        type: "directory",
      });
      setCreatingFolder(false);
      setCreateFolderValue("");
      await refreshTree();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create folder.");
    } finally {
      setActionBusyKey(undefined);
    }
  }, [agentSlug, createFolderValue, refreshTree]);

  const handleDeleteNode = useCallback(
    async (node: FileNode) => {
      if (node.isCritical) {
        return;
      }

      const confirmed = window.confirm(`Delete ${node.name}? This action cannot be undone.`);
      if (!confirmed) {
        return;
      }

      setActionBusyKey(`delete:${node.path}`);
      setError(null);

      try {
        await deleteFileManagerEntry({
          root: "workspace",
          path: resolveSpecialistWorkspacePath(agentSlug, node.path),
        });
        if (selectedPath === node.path) {
          setSelectedPath(null);
        }
        await refreshTree();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to delete entry.");
      } finally {
        setActionBusyKey(undefined);
      }
    },
    [agentSlug, refreshTree, selectedPath],
  );

  const handleAddArtifact = useCallback(
    async (file: { name: string; path: string }) => {
      if (!onAddArtifact) {
        return;
      }

      setPendingArtifactPaths((current) => new Set(current).add(file.path));
      setArtifactStatus(undefined);
      try {
        await onAddArtifact(file);
        setArtifactStatus({ message: `${file.name} added as an artifact.`, type: "success" });
      } catch (nextError) {
        setArtifactStatus({
          message: nextError instanceof Error ? nextError.message : "Failed to add artifact.",
          type: "error",
        });
      } finally {
        setPendingArtifactPaths((current) => {
          const next = new Set(current);
          next.delete(file.path);
          return next;
        });
      }
    },
    [onAddArtifact],
  );

  const handleMoveNode = useCallback(
    async (sourcePath: string, destinationPath: string) => {
      if (sourcePath === destinationPath || sourcePath.startsWith(`${destinationPath}/`)) {
        return;
      }

      setActionBusyKey(`move:${sourcePath}`);
      setError(null);

      try {
        const response = await moveFileManagerEntry({
          root: "workspace",
          path: resolveSpecialistWorkspacePath(agentSlug, sourcePath),
          destinationPath: resolveSpecialistWorkspacePath(agentSlug, destinationPath),
        });
        if (selectedPath === sourcePath) {
          setSelectedPath(trimSpecialistWorkspacePrefix(agentSlug, response.path));
        }
        setExpandedPaths((current) => new Set(current).add(destinationPath));
        await refreshTree();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to move entry.");
      } finally {
        setActionBusyKey(undefined);
      }
    },
    [agentSlug, refreshTree, selectedPath],
  );

  const handleDropExternalFiles = useCallback(
    async (event: React.DragEvent<HTMLElement>, destinationPath: string) => {
      event.preventDefault();
      event.stopPropagation();

      const internalPath = event.dataTransfer.getData("application/x-cc-workspace-path");
      if (internalPath.length > 0) {
        const sourceNode = findNodeByPath(roots, childrenByPath, internalPath);
        if (!sourceNode || sourceNode.isCritical) {
          return;
        }
        await handleMoveNode(internalPath, destinationPath);
        return;
      }

      const files = await extractDroppedUploadableFiles(event.dataTransfer);
      if (files.length === 0) {
        return;
      }

      setActionBusyKey(`upload:${destinationPath}`);
      setError(null);

      try {
        await uploadFileManagerEntries({
          root: "workspace",
          destinationPath: resolveSpecialistWorkspacePath(agentSlug, destinationPath),
          entries: await toFileManagerUploadEntries(files),
        });
        if (destinationPath !== ".") {
          setExpandedPaths((current) => new Set(current).add(destinationPath));
        }
        await refreshTree();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to upload files.");
      } finally {
        setActionBusyKey(undefined);
      }
    },
    [agentSlug, childrenByPath, handleMoveNode, refreshTree, roots],
  );

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8 text-sm text-text-secondary">
          Loading files...
        </div>
      );
    }

    return (
      <>
        {error ? (
          <div className="px-4 py-3 text-center text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
        {artifactStatus ? (
          <p
            className={`px-1 pb-2 text-xs ${artifactStatus.type === "error" ? "text-danger" : "text-text-secondary"}`}
            role={artifactStatus.type === "error" ? "alert" : "status"}
          >
            {artifactStatus.message}
          </p>
        ) : null}
        <p className="px-1 pb-2 text-[11px] text-text-secondary">
          Drop files here to upload. Drag files into message area to mention.
        </p>
        <CreateFolderRow
          busy={actionBusyKey === "create-folder"}
          creating={creatingFolder}
          name={createFolderValue}
          refreshing={refreshing}
          onChange={setCreateFolderValue}
          onCreate={() => setCreatingFolder(true)}
          onCancel={() => {
            setCreatingFolder(false);
            setCreateFolderValue("");
          }}
          onRefresh={() => void refreshTree()}
          onSubmit={() => void handleCreateFolder()}
        />
        {!roots || roots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            No files in workspace
          </div>
        ) : (
          roots.map((node) => (
            <TreeNode
              key={node.path}
              actionBusyKey={actionBusyKey}
              childrenByPath={childrenByPath}
              depth={0}
              dropTargetPath={dropTargetPath}
              expandedPaths={expandedPaths}
              loadingPaths={loadingPaths}
              node={node}
              pendingArtifactPaths={pendingArtifactPaths}
              onDeleteNode={handleDeleteNode}
              onAddArtifact={onAddArtifact ? handleAddArtifact : undefined}
              onDragTargetChange={setDropTargetPath}
              onDropExternalFiles={handleDropExternalFiles}
              onMoveNode={handleMoveNode}
              onOpenFile={onOpenFile}
              onOpenLocation={openLocation}
              onSelect={setSelectedPath}
              onToggleDirectory={toggleDirectory}
              selectedPath={selectedPath}
            />
          ))
        )}
      </>
    );
  }, [
    actionBusyKey,
    artifactStatus,
    childrenByPath,
    createFolderValue,
    creatingFolder,
    dropTargetPath,
    error,
    expandedPaths,
    handleCreateFolder,
    handleAddArtifact,
    handleDeleteNode,
    handleDropExternalFiles,
    handleMoveNode,
    loading,
    loadingPaths,
    onAddArtifact,
    onOpenFile,
    openLocation,
    pendingArtifactPaths,
    refreshing,
    refreshTree,
    roots,
    selectedPath,
    toggleDirectory,
  ]);

  return (
    <div
      className={`py-1 ${dropTargetPath === "." ? "bg-accent/5" : ""}`}
      onDragEnter={(event) => {
        if (hasTransferPayload(event)) {
          event.preventDefault();
          setDropTargetPath(".");
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDropTargetPath(null);
        }
      }}
      onDragOver={(event) => {
        if (hasTransferPayload(event)) {
          event.preventDefault();
          setDropTargetPath(".");
        }
      }}
      onDrop={(event) => {
        setDropTargetPath(null);
        void handleDropExternalFiles(event, ".");
      }}
    >
      {content}
    </div>
  );
}

function TreeNode(props: TreeNodeProps) {
  const { node } = props;
  const isDir = node.type === "directory";
  const isSelected = props.selectedPath === node.path;
  const isExpanded = props.expandedPaths.has(node.path);
  const isLoading = props.loadingPaths.has(node.path);
  const isCritical = node.isCritical === true;
  const isDropTarget = props.dropTargetPath === node.path;
  const children = props.childrenByPath[node.path] ?? [];
  const canAcceptDrop = isDir && !isCritical;

  return (
    <div className="group">
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-0.5 transition ${
          isSelected ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-surface-elevated"
        } ${isDropTarget ? "ring-1 ring-accent bg-accent/5" : ""}`}
        draggable={!isCritical}
        onDragEnd={() => {
          props.onDragTargetChange(null);
        }}
        onDragStart={(event) => {
          if (isCritical) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-cc-workspace-path", node.path);
          if (!isDir) {
            event.dataTransfer.setData("application/x-cc-file-mention", node.path);
          }
        }}
        onDragEnter={(event) => {
          if (canAcceptDrop && hasTransferPayload(event)) {
            event.preventDefault();
            props.onDragTargetChange(node.path);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target && props.dropTargetPath === node.path) {
            props.onDragTargetChange(null);
          }
        }}
        onDragOver={(event) => {
          if (canAcceptDrop && hasTransferPayload(event)) {
            event.preventDefault();
            props.onDragTargetChange(node.path);
          }
        }}
        onDrop={(event) => {
          props.onDragTargetChange(null);
          if (canAcceptDrop) {
            void props.onDropExternalFiles(event, node.path);
          }
        }}
        style={{ paddingLeft: `${String(props.depth * 16 + 4)}px` }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5 text-left text-xs"
          onDoubleClick={() => {
            if (!isDir) {
              props.onOpenFile?.(node.path);
            }
          }}
          onClick={() => {
            if (isDir) {
              void props.onToggleDirectory(node.path);
              return;
            }

            props.onSelect(node.path);
          }}
        >
          {isDir ? (
            <>
              <span className="text-text-secondary w-3 text-center text-[14px]">
                {isLoading ? "…" : isExpanded ? "▾" : "▸"}
              </span>
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          ) : (
            <>
              <span className="w-3" />
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <button
          aria-label={`Show ${node.name} in file manager`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenLocation(node.path);
          }}
          title="Show file location"
          type="button"
        >
          <FolderSearch className="h-3.5 w-3.5" />
        </button>
        {!isDir && props.onOpenFile ? (
          <button
            aria-label={`Open ${node.name} in quick editor`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              props.onSelect(node.path);
              props.onOpenFile?.(node.path);
            }}
            title="Open in quick editor"
            type="button"
          >
            <FilePenLine className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {!isDir && props.onAddArtifact ? (
          <button
            aria-label={`Add ${node.name} as artifact`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            disabled={props.pendingArtifactPaths.has(node.path)}
            onClick={(event) => {
              event.stopPropagation();
              void props.onAddArtifact?.({ name: node.name, path: node.path });
            }}
            title="Add as artifact"
            type="button"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label={`Delete ${node.name}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-100 transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          disabled={
            isCritical ||
            props.actionBusyKey === `delete:${node.path}` ||
            props.actionBusyKey === `move:${node.path}`
          }
          onClick={(event) => {
            event.stopPropagation();
            void props.onDeleteNode(node);
          }}
          title={isCritical ? (node.criticalReason ?? "Protected") : "Delete"}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isDir && isExpanded ? (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              actionBusyKey={props.actionBusyKey}
              childrenByPath={props.childrenByPath}
              depth={props.depth + 1}
              dropTargetPath={props.dropTargetPath}
              expandedPaths={props.expandedPaths}
              loadingPaths={props.loadingPaths}
              node={child}
              pendingArtifactPaths={props.pendingArtifactPaths}
              onDeleteNode={props.onDeleteNode}
              onAddArtifact={props.onAddArtifact}
              onDragTargetChange={props.onDragTargetChange}
              onDropExternalFiles={props.onDropExternalFiles}
              onMoveNode={props.onMoveNode}
              onOpenFile={props.onOpenFile}
              onOpenLocation={props.onOpenLocation}
              onSelect={props.onSelect}
              onToggleDirectory={props.onToggleDirectory}
              selectedPath={props.selectedPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateFolderRow(props: {
  creating: boolean;
  name: string;
  busy: boolean;
  refreshing: boolean;
  onCreate: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onRefresh: () => void;
  onSubmit: () => void;
}) {
  if (!props.creating) {
    return (
      <div className="mb-1 flex items-center gap-2 px-1 py-0.5">
        <button
          aria-busy={props.refreshing}
          aria-label={props.refreshing ? "Refreshing files" : "Refresh files"}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          disabled={props.refreshing}
          onClick={props.onRefresh}
          title={props.refreshing ? "Refreshing files" : "Refresh files"}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${props.refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </button>
        <button
          aria-label="Create folder"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={props.onCreate}
          type="button"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="mb-1 flex items-center gap-2 px-1 py-0.5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <FolderPlus className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
      <input
        aria-label="New folder name"
        autoFocus
        className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary outline-none ring-0"
        onBlur={() => {
          if (!props.busy && props.name.trim().length === 0) {
            props.onCancel();
          }
        }}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onCancel();
          }
        }}
        placeholder="New folder"
        value={props.name}
      />
    </form>
  );
}

function hasTransferPayload(event: React.DragEvent<HTMLElement>): boolean {
  const transfer = event.dataTransfer;
  return (
    transfer.types.includes("application/x-cc-workspace-path") ||
    transfer.types.includes("Files") ||
    transfer.files.length > 0
  );
}

function filterVisibleNodes(nodes: FileNode[]): FileNode[] {
  return nodes.filter((node) => !node.isCritical);
}

function findNodeByPath(
  roots: FileNode[] | null,
  childrenByPath: Record<string, FileNode[]>,
  path: string,
): FileNode | undefined {
  for (const node of roots ?? []) {
    if (node.path === path) {
      return node;
    }
  }

  for (const children of Object.values(childrenByPath)) {
    for (const child of children) {
      if (child.path === path) {
        return child;
      }
    }
  }

  return undefined;
}

function trimSpecialistWorkspacePrefix(agentSlug: string, path: string): string {
  const rootPath = `specialists/${agentSlug}`;
  const prefix = `${rootPath}/`;

  if (path === rootPath) {
    return ".";
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
