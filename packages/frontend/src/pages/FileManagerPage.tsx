import { useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, FilePlus, FolderPlus, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";

import type {
  FileManagerNode,
  FileManagerRootKind,
  FileManagerUploadInput,
  FileManagerUploadResponse,
} from "@cc/shared/schemas";

import { CopyIdButton } from "@/components/chat/CopyIdButton";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { EditorTabsSurface } from "@/components/workspace/EditorTabsSurface";
import { useEditorTabs } from "@/hooks/use-editor-tabs";
import {
  createFileManagerEntry,
  deleteFileManagerEntry,
  listFileManagerNodes,
  renameFileManagerEntry,
  uploadFileManagerEntries,
} from "@/lib/api";

const ROOT_LABELS: Record<FileManagerRootKind, string> = {
  workspace: "Workspace",
  "all-agents": "All Agents",
  "host-filesystem": "Root",
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
  const [uploadMode, setUploadMode] = useState<"files" | "folder">("files");
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadState, setUploadState] = useState<{
    status: "idle" | "uploading" | "completed";
    message?: string;
    result?: FileManagerUploadResponse;
  }>({ status: "idle" });
  const folderInputRef = useRef<HTMLInputElement>(null);
  const tabsController = useEditorTabs();

  const dropzone = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles: File[]) => {
      void handleUploadFiles(acceptedFiles, uploadMode);
    },
  });

  useEffect(() => {
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
    if (params.toString() !== searchParams.toString()) {
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
      const entries = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          relativePath: resolveUploadRelativePath(file, mode),
          contentBase64: await readFileAsBase64(file),
          sizeBytes: file.size,
        })),
      );

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
                  {(["workspace", "all-agents", "host-filesystem"] as const).map((option) => {
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
                            <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Critical
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

function UploadPanel(props: {
  busy: boolean;
  active: boolean;
  mode: "files" | "folder";
  message?: string;
  result?: FileManagerUploadResponse;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
  rootProps: React.HTMLAttributes<HTMLDivElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  testId: string;
}) {
  return (
    <div
      className={
        props.active
          ? "mt-4 rounded-xl border border-accent bg-accent/5 p-4"
          : "mt-4 rounded-xl border border-dashed border-border bg-surface-elevated/60 p-4"
      }
      data-testid={props.testId}
      {...props.rootProps}
    >
      <input {...props.inputProps} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-text-primary">Upload files or folders</p>
          <p className="mt-1 text-sm text-text-secondary">
            Drop files or folders here, or choose a picker. Folder uploads keep relative paths.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="cc-button cc-button-secondary"
            onClick={props.onSelectFiles}
            type="button"
          >
            Files
          </button>
          <button
            className="cc-button cc-button-secondary"
            onClick={props.onSelectFolder}
            type="button"
          >
            Folder
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-text-secondary">
        {props.busy ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span>
          {props.message ?? `Ready to upload ${props.mode === "folder" ? "a folder" : "files"}.`}
        </span>
      </div>
      {props.result && props.result.rejected.length > 0 ? (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">
          {props.result.rejected.map((entry) => (
            <p key={`${entry.relativePath}:${entry.reason}`}>
              {entry.relativePath}: {entry.reason}
            </p>
          ))}
        </div>
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
  if (currentPath === ".") {
    return [];
  }

  const segments = currentPath.split(/[\\/]/).filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
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
  if (breadcrumbs.length === 0) {
    return [];
  }

  if (breadcrumbs.length <= 3) {
    return breadcrumbs;
  }

  const firstVisibleIndex = breadcrumbs.length - 3;
  const hiddenJumpTarget = breadcrumbs[firstVisibleIndex - 1];

  if (!hiddenJumpTarget) {
    return breadcrumbs.slice(-3);
  }

  return [{ label: "...", path: hiddenJumpTarget.path }, ...breadcrumbs.slice(-3)];
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

function resolveUploadRelativePath(file: File, mode: "files" | "folder"): string {
  if (mode === "folder") {
    const candidate = "webkitRelativePath" in file ? file.webkitRelativePath : "";

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return file.name;
}

async function readFileAsBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildUploadSummaryMessage(result: FileManagerUploadResponse): string {
  const uploadedCount = result.uploaded.length;
  const rejectedCount = result.rejected.length;

  if (rejectedCount === 0) {
    return `Uploaded ${uploadedCount} entr${uploadedCount === 1 ? "y" : "ies"}.`;
  }

  return `Uploaded ${uploadedCount} entr${uploadedCount === 1 ? "y" : "ies"}; ${rejectedCount} rejected.`;
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
