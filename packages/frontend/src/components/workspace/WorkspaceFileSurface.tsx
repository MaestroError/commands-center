import type { FileManagerFileContentKind, FileManagerFileRevision } from "@cc/shared/schemas";

import { MonacoFileEditor } from "./MonacoFileEditor";

export type WorkspaceFileSurfaceFile = {
  name: string;
  path: string;
  displayPath?: string;
  loading: boolean;
  error?: string;
  kind?: FileManagerFileContentKind;
  mimeType?: string;
  isWritable?: boolean;
  draft?: string;
  baseline?: string;
  binaryContentBase64?: string;
  revision?: FileManagerFileRevision;
  dirty: boolean;
};

type Props = {
  file?: WorkspaceFileSurfaceFile;
  busy?: boolean;
  conflict?: { currentRevision?: FileManagerFileRevision; message: string };
  errorMessage?: string;
  emptyState?: React.ReactNode;
  showPreviewHeader?: boolean;
  showTextPathLabel?: boolean;
  onDraftChange?: (draft: string) => void;
  onDiscardConflict?: () => void;
  onReloadRequested?: () => void;
  onSaveRequested?: (overrideRevision?: FileManagerFileRevision) => void;
};

export function WorkspaceFileSurface(props: Props) {
  const file = props.file;

  if (!file) {
    return props.emptyState ?? <EmptyEditorState />;
  }

  if (file.loading) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-text-secondary">
        Loading file...
      </div>
    );
  }

  if (file.error) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-sm text-danger">
        <p>{file.error}</p>
        <button
          className="cc-button cc-button-secondary"
          onClick={props.onReloadRequested}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!file.kind) {
    return null;
  }

  if (file.kind === "text") {
    return (
      <MonacoFileEditor
        baseline={file.baseline ?? ""}
        busy={props.busy ?? false}
        conflict={props.conflict}
        dirty={file.dirty}
        draft={file.draft ?? ""}
        errorMessage={props.errorMessage}
        isWritable={file.isWritable ?? false}
        mimeType={file.mimeType}
        name={file.name}
        onDiscardConflict={props.onDiscardConflict ?? noop}
        onDraftChange={props.onDraftChange ?? noop}
        onReloadRequested={props.onReloadRequested ?? noop}
        onSaveRequested={props.onSaveRequested ?? noop}
        path={file.displayPath ?? file.path}
        showPathLabel={props.showTextPathLabel}
      />
    );
  }

  if (file.kind === "binary" && file.mimeType && file.binaryContentBase64) {
    if (file.mimeType.startsWith("image/")) {
      return (
        <PreviewFrame
          name={file.name}
          path={file.displayPath ?? file.path}
          showHeader={props.showPreviewHeader}
        >
          <img
            alt={file.name}
            className="max-w-full rounded border border-border bg-surface sm:max-h-full"
            src={`data:${file.mimeType};base64,${file.binaryContentBase64}`}
          />
        </PreviewFrame>
      );
    }

    if (file.mimeType.startsWith("video/")) {
      return (
        <PreviewFrame
          name={file.name}
          path={file.displayPath ?? file.path}
          showHeader={props.showPreviewHeader}
        >
          <video
            className="max-w-full rounded border border-border bg-surface sm:max-h-full"
            controls
            src={`data:${file.mimeType};base64,${file.binaryContentBase64}`}
          />
        </PreviewFrame>
      );
    }

    if (file.mimeType === "application/pdf") {
      return (
        <PreviewFrame
          name={file.name}
          path={file.displayPath ?? file.path}
          showHeader={props.showPreviewHeader}
        >
          <iframe
            className="h-[75vh] w-full rounded border border-border bg-surface"
            src={`data:${file.mimeType};base64,${file.binaryContentBase64}`}
            title={file.name}
          />
        </PreviewFrame>
      );
    }
  }

  return <FallbackCard file={file} showHeader={props.showPreviewHeader} />;
}

function EmptyEditorState() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center px-6 text-sm text-text-secondary">
      <div className="max-w-md text-center">
        <p className="mb-1 font-medium text-text-primary">No file open</p>
        <p>Double-click a file in the browser, or press Enter on a focused file, to open it.</p>
      </div>
    </div>
  );
}

function PreviewFrame(props: {
  name: string;
  path: string;
  children: React.ReactNode;
  showHeader?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      {props.showHeader === false ? null : <PreviewHeader name={props.name} path={props.path} />}
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-background p-6 sm:items-center">
        {props.children}
      </div>
    </div>
  );
}

function PreviewHeader(props: { name: string; path: string }) {
  return (
    <div className="border-b border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium text-text-primary">{props.name}</p>
      <p className="truncate text-xs text-text-secondary">{props.path}</p>
    </div>
  );
}

function FallbackCard(props: { file: WorkspaceFileSurfaceFile; showHeader?: boolean }) {
  const { file } = props;
  const reason =
    file.kind === "too-large"
      ? "This file is larger than the 2 MB editor limit."
      : "This file type is not editable in-app.";

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      {props.showHeader === false ? null : (
        <PreviewHeader name={file.name} path={file.displayPath ?? file.path} />
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">{file.name}</p>
          <p className="mt-2">{reason}</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-secondary">Path</dt>
            <dd className="break-all text-text-primary">{file.displayPath ?? file.path}</dd>
            {file.revision ? (
              <>
                <dt className="text-text-secondary">Size</dt>
                <dd className="text-text-primary">{formatSize(file.revision.sizeBytes)}</dd>
              </>
            ) : null}
            {file.mimeType ? (
              <>
                <dt className="text-text-secondary">Type</dt>
                <dd className="text-text-primary">{file.mimeType}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${String(sizeBytes)} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function noop() {}
