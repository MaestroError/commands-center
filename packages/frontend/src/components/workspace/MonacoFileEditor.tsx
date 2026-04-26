import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerRootKind,
} from "@cc/shared/schemas";

import { FileSaveConflictError, saveFileManagerFileContent } from "@/lib/api";

const MonacoEditor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

type Props = {
  file: FileManagerFileContentResponse;
  root: FileManagerRootKind;
  onSaved: (response: { revision: FileManagerFileRevision }) => void;
  onReloadRequested: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

export function MonacoFileEditor(props: Props) {
  const [draft, setDraft] = useState(props.file.content);
  const [baseline, setBaseline] = useState(props.file.content);
  const [revision, setRevision] = useState<FileManagerFileRevision>(props.file.revision);
  const [conflict, setConflict] = useState<{
    currentRevision?: FileManagerFileRevision;
    message: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileKeyRef = useRef<string>(`${props.root}:${props.file.path}`);

  useEffect(() => {
    const nextKey = `${props.root}:${props.file.path}`;
    if (nextKey !== fileKeyRef.current) {
      fileKeyRef.current = nextKey;
      setDraft(props.file.content);
      setBaseline(props.file.content);
      setRevision(props.file.revision);
      setConflict(undefined);
      setError(undefined);
    }
  }, [props.root, props.file.path, props.file.content, props.file.revision]);

  const dirty = draft !== baseline;

  useEffect(() => {
    props.onDirtyChange(dirty);
  }, [dirty, props]);

  const language = useMemo(
    () => guessLanguage(props.file.name, props.file.mimeType),
    [props.file.name, props.file.mimeType],
  );

  const handleSave = useCallback(
    async (overrideRevision?: FileManagerFileRevision) => {
      if (busy) {
        return;
      }
      setBusy(true);
      setError(undefined);

      try {
        const response = await saveFileManagerFileContent({
          root: props.root,
          path: props.file.path,
          content: draft,
          expectedRevision: overrideRevision ?? revision,
        });
        setRevision(response.revision);
        setBaseline(draft);
        setConflict(undefined);
        props.onSaved({ revision: response.revision });
      } catch (saveError) {
        if (saveError instanceof FileSaveConflictError) {
          setConflict({ currentRevision: saveError.currentRevision, message: saveError.message });
        } else {
          setError(saveError instanceof Error ? saveError.message : "Failed to save file.");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, draft, props, revision],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSave) {
        return;
      }
      event.preventDefault();
      void handleSave();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <span className="truncate">{props.file.name}</span>
            {dirty ? (
              <span
                aria-label="Unsaved changes"
                className="inline-block h-2 w-2 rounded-full bg-amber-500"
              />
            ) : null}
          </p>
          <p className="truncate text-xs text-text-secondary">{props.file.path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="cc-button cc-button-secondary"
            disabled={busy}
            onClick={() => {
              setDraft(baseline);
              setConflict(undefined);
              setError(undefined);
              props.onReloadRequested();
            }}
            type="button"
          >
            Reload
          </button>
          <button
            className="cc-button cc-button-primary"
            disabled={busy || !props.file.isWritable || !dirty}
            onClick={() => void handleSave()}
            type="button"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {!props.file.isWritable ? (
        <div className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          This root is read-only. Enable host-filesystem editing in Settings to save changes.
        </div>
      ) : null}
      {conflict ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span className="min-w-0">{conflict.message}</span>
          <div className="flex shrink-0 gap-2">
            <button
              className="cc-button cc-button-secondary"
              onClick={() => {
                setConflict(undefined);
                props.onReloadRequested();
              }}
              type="button"
            >
              Reload from disk
            </button>
            <button
              className="cc-button cc-button-secondary"
              disabled={busy}
              onClick={() => void handleSave(conflict.currentRevision ?? revision)}
              type="button"
            >
              Overwrite
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              Loading editor...
            </div>
          }
        >
          <MonacoEditor
            value={draft}
            language={language}
            onChange={(value) => setDraft(value ?? "")}
            options={{
              minimap: { enabled: false },
              readOnly: !props.file.isWritable,
              automaticLayout: true,
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
            theme="vs-dark"
          />
        </Suspense>
      </div>
    </div>
  );
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  sh: "shell",
  bash: "shell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  sql: "sql",
};

function guessLanguage(name: string, mimeType?: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && LANGUAGE_BY_EXT[ext]) {
    return LANGUAGE_BY_EXT[ext];
  }
  if (mimeType?.startsWith("text/")) {
    return "plaintext";
  }
  return undefined;
}
