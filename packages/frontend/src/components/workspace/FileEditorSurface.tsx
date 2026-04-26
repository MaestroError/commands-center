import { useEffect, useState } from "react";

import type {
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
} from "@cc/shared/schemas";

import { getFileManagerFileContent } from "@/lib/api";

import { MonacoFileEditor } from "./MonacoFileEditor";

type OpenedFile = {
  root: FileManagerRootKind;
  path: string;
};

type Props = {
  opened?: OpenedFile;
  reloadKey: number;
  onDirtyChange: (dirty: boolean) => void;
};

export function FileEditorSurface(props: Props) {
  const [file, setFile] = useState<FileManagerFileContentResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const { opened, reloadKey, onDirtyChange } = props;

  useEffect(() => {
    if (!opened) {
      setFile(undefined);
      setError(undefined);
      setLoading(false);
      onDirtyChange(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void getFileManagerFileContent({ root: opened.root, path: opened.path })
      .then((response) => {
        if (cancelled) return;
        setFile(response);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load file.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [opened, reloadKey, onDirtyChange]);

  if (!props.opened) {
    return <EmptyEditorState />;
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-text-secondary">
        Loading file...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center px-6 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!file) {
    return null;
  }

  if (file.kind === "text") {
    return (
      <MonacoFileEditor
        file={file}
        root={props.opened.root}
        onDirtyChange={props.onDirtyChange}
        onReloadRequested={() => {
          props.onDirtyChange(false);
          setFile(undefined);
          setLoading(true);
          void getFileManagerFileContent({ root: props.opened!.root, path: props.opened!.path })
            .then((response) => {
              setFile(response);
              setLoading(false);
            })
            .catch((nextError: unknown) => {
              setError(nextError instanceof Error ? nextError.message : "Failed to reload file.");
              setLoading(false);
            });
        }}
        onSaved={() => {
          // Editor manages its own baseline post-save; nothing else to do here.
        }}
      />
    );
  }

  if (file.kind === "binary" && file.mimeType) {
    if (file.mimeType.startsWith("image/")) {
      return (
        <PreviewFrame file={file}>
          <img
            alt={file.name}
            className="max-h-full max-w-full rounded border border-border bg-surface"
            src={`data:${file.mimeType};base64,${file.content}`}
          />
        </PreviewFrame>
      );
    }

    if (file.mimeType.startsWith("video/")) {
      return (
        <PreviewFrame file={file}>
          <video
            className="max-h-full max-w-full rounded border border-border bg-surface"
            controls
            src={`data:${file.mimeType};base64,${file.content}`}
          />
        </PreviewFrame>
      );
    }
  }

  return <FallbackCard file={file} />;
}

function EmptyEditorState() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center px-6 text-sm text-text-secondary">
      <div className="max-w-md text-center">
        <p className="mb-1 font-medium text-text-primary">No file open</p>
        <p>
          Double-click a file in the browser, or press Enter on a focused file, to open it for
          editing or preview.
        </p>
      </div>
    </div>
  );
}

function PreviewFrame(props: { file: FileManagerFileContentResponse; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <PreviewHeader file={props.file} />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-6">
        {props.children}
      </div>
    </div>
  );
}

function PreviewHeader(props: { file: FileManagerFileContentResponse }) {
  return (
    <div className="border-b border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium text-text-primary">{props.file.name}</p>
      <p className="truncate text-xs text-text-secondary">{props.file.path}</p>
    </div>
  );
}

function FallbackCard(props: { file: FileManagerFileContentResponse }) {
  const reason =
    props.file.kind === "too-large"
      ? "This file is larger than the 2 MB editor limit."
      : "This file type is not editable in-app.";

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <PreviewHeader file={props.file} />
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">{props.file.name}</p>
          <p className="mt-2">{reason}</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-secondary">Path</dt>
            <dd className="break-all text-text-primary">{props.file.path}</dd>
            <dt className="text-text-secondary">Size</dt>
            <dd className="text-text-primary">{formatSize(props.file.revision.sizeBytes)}</dd>
            {props.file.mimeType ? (
              <>
                <dt className="text-text-secondary">Type</dt>
                <dd className="text-text-primary">{props.file.mimeType}</dd>
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

export type { OpenedFile };
export type { FileManagerFileRevision };
