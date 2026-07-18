import { useCallback, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCopy, FolderOpen, Save } from "lucide-react";

import type {
  DocumentReadResponse,
  DocumentScope,
  FileManagerFileRevision,
} from "@cc/shared/schemas";

import { LoadingState } from "@/components/common/PageStates";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { DocumentFolderView } from "@/components/documents/DocumentFolderView";
import { LazyMilkdownEditor } from "@/components/documents/LazyMilkdownEditor";
import { getDocumentContent, saveDocumentContent, updateDocumentMetadata } from "@/lib/api";
import { buildDocumentFileManagerHref } from "@/lib/document-href";
import { queryKeys } from "@/lib/query-keys";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CONTEXT_TAB_STORAGE_KEY = "cc.documents.context-tab";

export function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const selectedFolder = parseSelectedFolder(searchParams);
  const selectedIdentity = parseSelectedDocument(searchParams);
  const selectedPath = selectedIdentity?.path ?? null;
  const queryClient = useQueryClient();
  const [activeContextTabId, setActiveContextTabId] = useState<"info" | "actions">(() => {
    const stored = window.sessionStorage.getItem(CONTEXT_TAB_STORAGE_KEY);
    return stored === "info" ? "info" : "actions";
  });

  const documentQuery = useQuery({
    queryKey: selectedIdentity
      ? queryKeys.documentContent(
          selectedIdentity.scope,
          selectedIdentity.ownerSlug,
          selectedIdentity.path,
        )
      : queryKeys.documentContent("global", null, ""),
    queryFn: () => getDocumentContent(selectedIdentity!),
    enabled: selectedIdentity !== null,
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
      if (selectedIdentity) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.documentContent(
            selectedIdentity.scope,
            selectedIdentity.ownerSlug,
            selectedIdentity.path,
          ),
        });
      }
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
    if (!selectedIdentity || pendingContentRef.current === null || !currentRevisionRef.current) {
      return;
    }
    saveMutation.mutate({
      scope: selectedIdentity.scope,
      ownerSlug: selectedIdentity.ownerSlug ?? undefined,
      path: selectedIdentity.path,
      content: pendingContentRef.current,
      expectedRevision: currentRevisionRef.current,
    });
  };

  let primaryContent: ReactNode;
  if (selectedFolder) {
    primaryContent = (
      <DocumentFolderView
        key={`${selectedFolder.scope}:${selectedFolder.ownerSlug ?? ""}:${selectedFolder.path}`}
        scope={selectedFolder.scope}
        ownerSlug={selectedFolder.ownerSlug}
        path={selectedFolder.path}
      />
    );
  } else if (selectedPath && selectedDoc) {
    primaryContent = (
      <div className="flex h-full flex-col" data-testid="document-editor-panel">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate text-lg font-semibold text-text-primary">
                {selectedDoc.title}
              </h2>
              <span className="min-w-0 truncate text-xs text-text-muted">
                {documentFilename(selectedDoc.relativePath)}
              </span>
            </div>
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
            <Button
              className="gap-1.5"
              disabled={!isDirty || saveMutation.isPending}
              onClick={handleSaveContent}
              type="button"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="document-editor-scroll">
          <LazyMilkdownEditor
            key={documentIdentityKey(selectedDoc)}
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
                  content: (
                    <DocumentActionsTab doc={selectedDoc} key={documentIdentityKey(selectedDoc)} />
                  ),
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

type SelectedDocument = {
  scope: DocumentScope;
  ownerSlug: string | null;
  path: string;
};

function parseSelectedFolder(searchParams: URLSearchParams): SelectedDocument | null {
  if (!searchParams.has("folder")) {
    return null;
  }
  const path = searchParams.get("folder") ?? "";

  const scope = searchParams.get("scope") === "private" ? "private" : "global";
  const ownerSlug = scope === "private" ? searchParams.get("owner") : null;
  if (scope === "private" && !ownerSlug) {
    return null;
  }

  return { scope, ownerSlug, path };
}

function parseSelectedDocument(searchParams: URLSearchParams): SelectedDocument | null {
  const path = searchParams.get("path");
  if (!path) {
    return null;
  }

  const scope = searchParams.get("scope") === "private" ? "private" : "global";
  const ownerSlug = scope === "private" ? searchParams.get("owner") : null;
  if (scope === "private" && !ownerSlug) {
    return null;
  }

  return {
    scope,
    ownerSlug,
    path,
  };
}

function documentIdentityKey(identity: {
  scope: DocumentScope;
  ownerSlug?: string | null;
  relativePath?: string;
  path?: string;
}): string {
  return `${identity.scope}:${identity.ownerSlug ?? ""}:${identity.relativePath ?? identity.path ?? ""}`;
}

function documentFilename(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function DocumentInfoTab(props: { doc: DocumentReadResponse }) {
  const { doc } = props;

  return (
    <div className="grid gap-3 p-2" data-testid="document-info-tab">
      <Metric label="Title" value={doc.title} />
      <Metric label="Scope" value={doc.scope} />
      {doc.ownerSlug ? <Metric label="Owner" value={doc.ownerSlug} /> : null}
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.documentContent(doc.scope, doc.ownerSlug, doc.relativePath),
      });
    },
  });

  const hasChanges =
    editTitle !== doc.title ||
    editDescription !== (doc.description ?? "") ||
    editAuthor !== (doc.author ?? "");

  const handleSaveMetadata = () => {
    metadataMutation.mutate({
      scope: doc.scope,
      ownerSlug: doc.ownerSlug ?? undefined,
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
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        </label>
        <label className="mt-2 grid gap-1 text-sm text-text-secondary">
          Description
          <Textarea
            className="min-h-16 resize-y"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </label>
        <label className="mt-2 grid gap-1 text-sm text-text-secondary">
          Author
          <Input value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} />
        </label>
        {metadataMutation.isError ? (
          <p className="mt-2 text-sm text-danger">
            {metadataMutation.error instanceof Error
              ? metadataMutation.error.message
              : "Failed to save metadata."}
          </p>
        ) : null}
        <Button
          className="mt-3 w-full gap-1.5"
          disabled={!hasChanges || metadataMutation.isPending}
          onClick={handleSaveMetadata}
          type="button"
        >
          <Save className="h-4 w-4" />
          {metadataMutation.isPending ? "Saving..." : "Save Metadata"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Quick actions
        </p>
        <div className="mt-3 grid gap-2">
          <Button
            variant="secondary"
            className="w-full gap-1.5 text-xs"
            onClick={() => copyToClipboard(doc.relativePath)}
            type="button"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy relative path
          </Button>
          <Button
            variant="secondary"
            className="w-full gap-1.5 text-xs"
            onClick={() => copyToClipboard(doc.fullPath)}
            type="button"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy full path
          </Button>
          <a
            className={buttonVariants({
              variant: "secondary",
              className: "flex w-full items-center justify-center gap-1.5 text-xs no-underline",
            })}
            href={fileManagerRevealHref(doc)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Reveal in File Manager
          </a>
        </div>
      </div>
    </div>
  );
}

function fileManagerRevealHref(doc: DocumentReadResponse): string {
  return buildDocumentFileManagerHref({
    scope: doc.scope,
    ownerSlug: doc.ownerSlug,
    relativePath: doc.relativePath,
    type: "file",
  });
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
