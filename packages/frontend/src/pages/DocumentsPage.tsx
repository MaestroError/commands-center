import { useCallback, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCopy, FolderOpen, Save } from "lucide-react";

import type { DocumentReadResponse, FileManagerFileRevision } from "@cc/shared/schemas";

import { LoadingState } from "@/components/common/PageStates";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { LazyMilkdownEditor } from "@/components/documents/LazyMilkdownEditor";
import { getDocumentContent, saveDocumentContent, updateDocumentMetadata } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const CONTEXT_TAB_STORAGE_KEY = "cc.documents.context-tab";

export function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const selectedPath = searchParams.get("path");
  const queryClient = useQueryClient();
  const [activeContextTabId, setActiveContextTabId] = useState<"info" | "actions">(() => {
    const stored = window.sessionStorage.getItem(CONTEXT_TAB_STORAGE_KEY);
    return stored === "info" ? "info" : "actions";
  });

  const documentQuery = useQuery({
    queryKey: queryKeys.documentContent(selectedPath ?? ""),
    queryFn: () => getDocumentContent(selectedPath!),
    enabled: !!selectedPath,
  });

  const selectedDoc = documentQuery.data;
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<FileManagerFileRevision | null>(null);

  if (selectedDoc) {
    currentRevisionRef.current = selectedDoc.revision;
  }

  const saveMutation = useMutation({
    mutationFn: saveDocumentContent,
    onSuccess: (result) => {
      currentRevisionRef.current = result.revision;
      setIsDirty(false);
      setSaveError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentContent(selectedPath!) });
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Save failed.");
    },
  });

  const handleEditorChange = useCallback((markdown: string) => {
    pendingContentRef.current = markdown;
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const handleSaveContent = () => {
    if (!selectedPath || pendingContentRef.current === null || !currentRevisionRef.current) return;
    saveMutation.mutate({
      path: selectedPath,
      content: pendingContentRef.current,
      expectedRevision: currentRevisionRef.current,
    });
  };

  let primaryContent: ReactNode;
  if (selectedPath && selectedDoc) {
    primaryContent = (
      <div className="flex h-full flex-col" data-testid="document-editor-panel">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-text-primary">
              {selectedDoc.title}
            </h2>
            {selectedDoc.description ? (
              <p className="mt-0.5 truncate text-sm text-text-secondary">
                {selectedDoc.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {saveError ? (
              <span className="flex items-center gap-1 text-xs text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                {saveError}
              </span>
            ) : null}
            {isDirty ? <span className="text-xs text-text-secondary">Unsaved changes</span> : null}
            <button
              className="cc-button gap-1.5"
              disabled={!isDirty || saveMutation.isPending}
              onClick={handleSaveContent}
              type="button"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="document-editor-scroll">
          <LazyMilkdownEditor
            key={selectedPath}
            initialContent={selectedDoc.content}
            onChange={handleEditorChange}
          />
        </div>
      </div>
    );
  } else if (selectedPath && documentQuery.isLoading) {
    primaryContent = (
      <div className="h-full overflow-y-auto p-4">
        <LoadingState />
      </div>
    );
  } else {
    primaryContent = (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <p className="text-lg font-semibold text-text-primary">No document selected</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Open a document from the Documents tree in the sidebar, or create one with the + buttons
            there.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      primary={primaryContent}
      contextPane={
        selectedDoc
          ? {
              title: "Document",
              activeTabId: activeContextTabId,
              defaultTabId: "actions",
              onTabChange: (tabId) => {
                const nextTabId = tabId === "info" ? "info" : "actions";
                setActiveContextTabId(nextTabId);
                window.sessionStorage.setItem(CONTEXT_TAB_STORAGE_KEY, nextTabId);
              },
              tabs: [
                {
                  id: "actions",
                  label: "Actions",
                  content: <DocumentActionsTab doc={selectedDoc} key={selectedDoc.relativePath} />,
                },
                {
                  id: "info",
                  label: "Info",
                  content: <DocumentInfoTab doc={selectedDoc} />,
                },
              ],
            }
          : undefined
      }
    />
  );
}

function DocumentInfoTab(props: { doc: DocumentReadResponse }) {
  const { doc } = props;

  return (
    <div className="grid gap-3 p-2" data-testid="document-info-tab">
      <Metric label="Title" value={doc.title} />
      <Metric label="Relative path" value={doc.relativePath} />
      <Metric label="Full path" value={doc.fullPath} />
      {doc.description ? <Metric label="Description" value={doc.description} /> : null}
      {doc.author ? <Metric label="Author" value={doc.author} /> : null}
      {doc.createdAt ? (
        <Metric label="Created" value={new Date(doc.createdAt).toLocaleString()} />
      ) : null}
      {doc.updatedAt ? (
        <Metric label="Updated" value={new Date(doc.updatedAt).toLocaleString()} />
      ) : null}
      <Metric label="Size" value={formatBytes(doc.revision.sizeBytes)} />
    </div>
  );
}

function DocumentActionsTab(props: { doc: DocumentReadResponse }) {
  const { doc } = props;
  const queryClient = useQueryClient();
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editDescription, setEditDescription] = useState(doc.description ?? "");
  const [editAuthor, setEditAuthor] = useState(doc.author ?? "");

  const metadataMutation = useMutation({
    mutationFn: updateDocumentMetadata,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentTree });
      void queryClient.invalidateQueries({ queryKey: queryKeys.documentContent(doc.relativePath) });
    },
  });

  const hasChanges =
    editTitle !== doc.title ||
    editDescription !== (doc.description ?? "") ||
    editAuthor !== (doc.author ?? "");

  const handleSaveMetadata = () => {
    metadataMutation.mutate({
      path: doc.relativePath,
      title: editTitle || undefined,
      description: editDescription || undefined,
      author: editAuthor || undefined,
    });
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="grid gap-4 p-2" data-testid="document-actions-tab">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Edit metadata
        </p>
        <label className="mt-3 grid gap-1 text-sm text-text-secondary">
          Title
          <input
            className="cc-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </label>
        <label className="mt-2 grid gap-1 text-sm text-text-secondary">
          Description
          <textarea
            className="cc-input min-h-16 resize-y"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </label>
        <label className="mt-2 grid gap-1 text-sm text-text-secondary">
          Author
          <input
            className="cc-input"
            value={editAuthor}
            onChange={(e) => setEditAuthor(e.target.value)}
          />
        </label>
        {metadataMutation.isError ? (
          <p className="mt-2 text-sm text-danger">
            {metadataMutation.error instanceof Error
              ? metadataMutation.error.message
              : "Failed to save metadata."}
          </p>
        ) : null}
        <button
          className="cc-button mt-3 w-full gap-1.5"
          disabled={!hasChanges || metadataMutation.isPending}
          onClick={handleSaveMetadata}
          type="button"
        >
          <Save className="h-4 w-4" />
          {metadataMutation.isPending ? "Saving..." : "Save Metadata"}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Quick actions
        </p>
        <div className="mt-3 grid gap-2">
          <button
            className="cc-button cc-button-secondary w-full gap-1.5 text-xs"
            onClick={() => copyToClipboard(doc.relativePath)}
            type="button"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy relative path
          </button>
          <button
            className="cc-button cc-button-secondary w-full gap-1.5 text-xs"
            onClick={() => copyToClipboard(doc.fullPath)}
            type="button"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy full path
          </button>
          <a
            className="cc-button cc-button-secondary flex w-full items-center justify-center gap-1.5 text-xs no-underline"
            href={`/files?root=workspace&path=${encodeURIComponent("Documents/" + doc.relativePath.substring(0, doc.relativePath.lastIndexOf("/")))}&select=Documents/${encodeURIComponent(doc.relativePath)}`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Reveal in File Manager
          </a>
        </div>
      </div>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 break-words font-medium text-text-primary">{props.value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
