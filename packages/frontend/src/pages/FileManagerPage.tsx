import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { EditorTabsSurface } from "@/components/workspace/EditorTabsSurface";
import { useEditorTabs } from "@/hooks/use-editor-tabs";
import {
  createFileManagerEntry,
  deleteFileManagerEntry,
  downloadFileManagerFile,
  downloadFileManagerFolderZip,
  listFileManagerNodes,
  moveFileManagerEntry,
  renameFileManagerEntry,
  uploadFileManagerEntries,
} from "@/lib/api";
import { normalizeUploadableFiles, toFileManagerUploadEntries } from "@/lib/file-transfer";
import type {
  FileManagerNode,
  FileManagerRootKind,
  FileManagerUploadInput,
  FileManagerUploadResponse,
} from "@cc/shared/schemas";
import { ArrowLeft, FilePlus, FolderPlus, Pencil, Shield, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSearchParams } from "react-router-dom";
import {
  CreateEntryDialog,
  DeleteEntryDialog,
  MoveEntryDialog,
  RenameEntryDialog,
} from "./file-manager/file-manager-dialogs";
import {
  ROOT_LABELS,
  buildBreadcrumbs,
  buildFileManagerRouteSignature,
  buildUploadSummaryMessage,
  collapseBreadcrumbs,
  getInitialRoot,
  getParentPath,
} from "./file-manager/file-manager-helpers";
import {
  SelectionActions,
  SelectionDetails,
  UploadPanel,
} from "./file-manager/file-manager-panels";

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
  const [moveTarget, setMoveTarget] = useState<FileManagerNode>();
  const [moveValue, setMoveValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FileManagerNode>();
  const [uploadMode, setUploadMode] = useState<"files" | "folder">("files");
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadState, setUploadState] = useState<{
    status: "idle" | "uploading" | "completed";
    message?: string;
    result?: FileManagerUploadResponse;
  }>({ status: "idle" });
  const folderInputRef = useRef<HTMLInputElement>(null);
  const tabsController = useEditorTabs();
  const rootRef = useRef(root);
  const currentPathRef = useRef(currentPath);
  const selectedPathRef = useRef(selectedPath);
  const routeSyncTargetRef = useRef<string | undefined>(undefined);

  rootRef.current = root;
  currentPathRef.current = currentPath;
  selectedPathRef.current = selectedPath;

  const dropzone = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles: File[]) => {
      void handleUploadFiles(acceptedFiles, uploadMode);
    },
  });

  useEffect(() => {
    const routeRoot = getInitialRoot(searchParams);
    const routePath = searchParams.get("path") ?? ".";
    const routeSelectedPath = searchParams.get("select") ?? "";

    if (
      routeRoot === rootRef.current &&
      routePath === currentPathRef.current &&
      routeSelectedPath === selectedPathRef.current
    ) {
      routeSyncTargetRef.current = undefined;
      return;
    }

    routeSyncTargetRef.current = buildFileManagerRouteSignature(
      routeRoot,
      routePath,
      routeSelectedPath,
    );
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    const routeSignature = routeSyncTargetRef.current;

    if (routeSignature) {
      const localSignature = buildFileManagerRouteSignature(root, currentPath, selectedPath);

      if (localSignature !== routeSignature) {
        return;
      }

      routeSyncTargetRef.current = undefined;
    }

    const params = new URLSearchParams(searchParams);
    params.set("root", root);
    if (currentPath !== ".") {
      params.set("path", currentPath);
    } else {
      params.delete("path");
    }
    if (selectedPath) {
      params.set("select", selectedPath);
    } else {
      params.delete("select");
    }
    const nextSearch = params.toString();

    if (nextSearch !== currentSearch) {
      setSearchParams(params, { replace: true });
    }
  }, [currentPath, root, selectedPath, searchParams, setSearchParams]);

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

  useEffect(() => {
    const nextRoot = getInitialRoot(searchParams);
    const nextPath = searchParams.get("path") ?? ".";
    const nextSelectedPath = searchParams.get("select") ?? "";

    if (nextRoot !== rootRef.current) {
      setRoot(nextRoot);
    }

    if (nextPath !== currentPathRef.current) {
      setCurrentPath(nextPath);
    }

    if (nextSelectedPath !== selectedPathRef.current) {
      setSelectedPath(nextSelectedPath);
    }
  }, [searchParams]);

  const selectedNode = useMemo(
    () => data?.nodes.find((node) => node.path === selectedPath),
    [data?.nodes, selectedPath],
  );
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentPath), [currentPath]);
  const visibleBreadcrumbs = useMemo(() => collapseBreadcrumbs(breadcrumbs), [breadcrumbs]);
  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedPath, data?.currentPath]);

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

  async function handleMove(node: FileManagerNode) {
    if (node.isCritical) {
      return;
    }

    const destinationPath = moveValue.trim();
    if (destinationPath.length === 0) {
      return;
    }

    setBusyAction(`move-${node.path}`);
    setError(undefined);

    try {
      const response = await moveFileManagerEntry({
        root,
        path: node.path,
        destinationPath,
      });
      if (selectedPath === node.path) {
        setSelectedPath(response.path);
      }
      const nextListing = await listFileManagerNodes({ root, path: currentPath });
      setData(nextListing);
      setMoveTarget(undefined);
      setMoveValue("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to move entry.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function refreshCurrentDirectory(): Promise<void> {
    const response = await listFileManagerNodes({ root, path: currentPath });
    setData(response);
  }

  async function handleUploadFiles(files: File[], mode: "files" | "folder"): Promise<void> {
    if (files.length === 0) {
      return;
    }

    setBusyAction("upload");
    setError(undefined);
    setUploadState({
      status: "uploading",
      message: `Uploading ${files.length} entr${files.length === 1 ? "y" : "ies"}...`,
    });

    try {
      const entries = await toFileManagerUploadEntries(normalizeUploadableFiles(files, mode));

      const result = await uploadFileManagerEntries({
        root,
        destinationPath: currentPath,
        entries,
      } satisfies FileManagerUploadInput);

      await refreshCurrentDirectory();
      setUploadState({
        status: "completed",
        message: buildUploadSummaryMessage(result),
        result,
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to upload files.";
      setError(message);
      setUploadState({ status: "completed", message });
    } finally {
      setBusyAction(undefined);
    }
  }

  function toggleUploadPanel() {
    setUploadPanelOpen((current) => !current);
  }

  return (
    <>
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
                  onDownload={(node) =>
                    downloadFileManagerFile({ root, path: node.path }, node.name)
                  }
                  onDownloadZip={(node) =>
                    downloadFileManagerFolderZip({ root, path: node.path }, node.name)
                  }
                  onStartMove={(node) => {
                    setMoveTarget(node);
                    setMoveValue(currentPath);
                  }}
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
          <div className="flex flex-col gap-2 overflow-y-auto lg:grid h-full lg:min-h-[28rem] lg:grid-cols-[minmax(16rem,22rem)_1fr] lg:overflow-visible">
            <div className="flex flex-col rounded-lg border border-border bg-surface lg:h-full lg:min-h-[28rem]">
              <div className="border-b border-border px-4 py-4">
                <div className="flex flex-wrap gap-1 border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(["workspace", "all-specialists", "host-filesystem"] as const).map((option) => {
                    return (
                      <button
                        aria-pressed={root === option}
                        aria-selected={root === option}
                        className={
                          root === option
                            ? "relative shrink-0 px-3 py-2 text-[11px] text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-accent"
                            : "relative shrink-0 px-3 py-2 text-[11px] text-text-secondary transition hover:text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="mt-4 flex items-start justify-between text-xs text-text-secondary">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <button
                        className="rounded px-0 py-1 text-sm font-medium text-text-primary transition hover:bg-surface-elevated"
                        onClick={() => {
                          setCurrentPath(".");
                          setSelectedPath("");
                        }}
                        type="button"
                      >
                        {ROOT_LABELS[root]}
                      </button>
                      {visibleBreadcrumbs.map((crumb) => (
                        <div className="flex min-w-0 items-center gap-2" key={crumb.path}>
                          <span aria-hidden="true" className="text-text-secondary">
                            /
                          </span>
                          <button
                            className="max-w-[18rem] truncate rounded px-0 py-1 text-sm transition hover:bg-surface-elevated hover:text-text-primary"
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
                    <div className="flex items-center gap-1.5">
                      <button
                        aria-label="Go to parent folder"
                        className="inline-flex h-8 w-8 items-center justify-center text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div className="ml-auto inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-surface">
                        <button
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-text-primary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={busyAction !== undefined}
                          onClick={() => {
                            setCreateType("file");
                            setCreateValue("");
                          }}
                          type="button"
                        >
                          <FilePlus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">New file</span>
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 border-l border-border px-3 py-2 text-[11px] font-medium text-text-primary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={busyAction !== undefined}
                          onClick={() => {
                            setCreateType("directory");
                            setCreateValue("");
                          }}
                          type="button"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">New folder</span>
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 border-l border-border px-3 py-2 text-[11px] font-medium text-text-primary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={busyAction !== undefined}
                          onClick={toggleUploadPanel}
                          type="button"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Upload</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" aria-hidden="true" />
                </div>
                {uploadPanelOpen ? (
                  <UploadPanel
                    active={dropzone.isDragActive}
                    busy={busyAction === "upload"}
                    inputProps={dropzone.getInputProps()}
                    message={uploadState.message}
                    mode={uploadMode}
                    onSelectFiles={() => {
                      setUploadMode("files");
                      dropzone.open();
                    }}
                    onSelectFolder={() => {
                      setUploadMode("folder");
                      folderInputRef.current?.click();
                    }}
                    result={uploadState.result}
                    rootProps={dropzone.getRootProps()}
                    testId="file-manager-upload-panel"
                  />
                ) : null}
              </div>
              {loading ? (
                <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-text-secondary">
                  Loading files...
                </div>
              ) : error ? (
                <div className="px-4 py-10 text-sm text-danger">{error}</div>
              ) : data && data.nodes.length > 0 ? (
                <div
                  className={
                    dropzone.isDragActive
                      ? "min-h-0 flex-1 overflow-auto border-t border-accent bg-accent/5 p-2 sm:mr-0 mr-10 sm:max-h-full max-h-[40vh]"
                      : "min-h-0 flex-1 overflow-auto p-2 sm:mr-0 mr-10 sm:max-h-full max-h-[40vh]"
                  }
                  data-testid="file-manager-list-dropzone"
                  {...dropzone.getRootProps()}
                >
                  <input {...dropzone.getInputProps()} />
                  <div className="mb-2 px-1 text-[11px] leading-4 text-text-secondary">
                    Drop files here.
                  </div>
                  <div className="grid gap-1">
                    {data.nodes.map((node) => {
                      const isSelected = node.path === selectedPath;
                      const actionBusy = busyAction?.endsWith(node.path) ?? false;

                      return (
                        <div
                          aria-pressed={isSelected}
                          data-testid={`file-row-${node.path}`}
                          className={
                            isSelected
                              ? "flex items-center gap-1.5 rounded-md border border-accent bg-accent/5 px-2 py-1"
                              : "flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1"
                          }
                          key={node.path}
                          ref={isSelected ? selectedRowRef : null}
                          onClick={() => setSelectedPath(node.path)}
                          onDoubleClick={() => {
                            openNode(node);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              setSelectedPath(node.path);
                              openNode(node);
                            } else if (event.key === " ") {
                              event.preventDefault();
                              setSelectedPath(node.path);
                            }
                          }}
                        >
                          <button
                            aria-label={`Open ${node.name}`}
                            className="shrink-0 text-base leading-none"
                            onClick={(event) => {
                              event.stopPropagation();
                              openNode(node);
                            }}
                            type="button"
                          >
                            {node.type === "directory" ? "📁" : "📄"}
                          </button>
                          <button
                            className="max-w-[10rem] truncate text-xs font-medium text-text-primary underline-offset-4 hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              openNode(node);
                            }}
                            title={node.name}
                            type="button"
                          >
                            {node.name}
                          </button>
                          {node.isCritical ? (
                            <span
                              aria-label="Critical"
                              className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/10 p-0.5 text-amber-700 dark:text-amber-300"
                              title="Critical"
                            >
                              <Shield className="h-3 w-3" />
                            </span>
                          ) : null}
                          {node.isCritical ? null : (
                            <button
                              aria-label="Rename"
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
                              disabled={actionBusy}
                              onClick={(event) => {
                                event.stopPropagation();
                                setRenameTarget(node);
                                setRenameValue(node.name);
                              }}
                              type="button"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            {node.type === "directory" ? (
                              <button
                                className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                              <button
                                aria-label="Delete"
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-danger transition hover:bg-danger/20 disabled:opacity-50"
                                disabled={actionBusy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget(node);
                                }}
                                type="button"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    dropzone.isDragActive
                      ? "flex flex-1 items-center justify-center border-t border-accent bg-accent/5 px-4 py-10 text-sm text-text-secondary"
                      : "flex flex-1 items-center justify-center px-4 py-10 text-sm text-text-secondary"
                  }
                  data-testid="file-manager-list-dropzone"
                  {...dropzone.getRootProps()}
                >
                  <input {...dropzone.getInputProps()} />
                  Drop files or folders here to upload into this empty folder.
                </div>
              )}
            </div>
            <div
              className={[
                "flex-col rounded-lg border border-border bg-surface lg:h-full lg:overflow-auto",
                tabsController.tabs.length === 0 ? "hidden lg:flex" : "flex",
              ].join(" ")}
            >
              <EditorTabsSurface controller={tabsController} />
            </div>
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
      {moveTarget ? (
        <MoveEntryDialog
          busy={busyAction === `move-${moveTarget.path}`}
          currentPath={currentPath}
          destinationPath={moveValue}
          node={moveTarget}
          root={root}
          onChange={setMoveValue}
          onClose={() => {
            setMoveTarget(undefined);
            setMoveValue("");
          }}
          onSubmit={() => void handleMove(moveTarget)}
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
      <input
        className="sr-only"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          void handleUploadFiles(files, "folder");
          event.target.value = "";
        }}
        ref={folderInputRef}
        // @ts-expect-error webkitdirectory is supported in browsers we target.
        webkitdirectory=""
        type="file"
      />
    </>
  );

  function openNode(node: FileManagerNode) {
    if (node.type === "directory") {
      setCurrentPath(node.path);
      setSelectedPath("");
      return;
    }

    if (node.type === "file") {
      tabsController.open({ root, path: node.path });
    }
  }
}
