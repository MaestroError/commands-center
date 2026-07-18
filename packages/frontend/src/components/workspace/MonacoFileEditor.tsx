import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { RotateCw, Save } from "lucide-react";

import type { FileManagerFileRevision } from "@cc/shared/schemas";

import { useTheme } from "@/context/use-theme";

import { getMonacoThemeId, registerMonacoTheme, type MonacoThemeApi } from "./monaco-theme";

const MonacoEditor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

type Props = {
  name: string;
  path: string;
  draft: string;
  baseline: string;
  isWritable: boolean;
  dirty: boolean;
  busy: boolean;
  mimeType?: string;
  conflict?: { currentRevision?: FileManagerFileRevision; message: string };
  errorMessage?: string;
  showPathLabel?: boolean;
  onDraftChange: (draft: string) => void;
  onSaveRequested: (overrideRevision?: FileManagerFileRevision) => void;
  onReloadRequested: () => void;
  onDiscardConflict: () => void;
};

export function MonacoFileEditor(props: Props) {
  const { resolvedColorMode } = useTheme();
  const monacoRef = useRef<MonacoThemeApi | null>(null);
  const {
    busy,
    conflict,
    dirty,
    draft,
    errorMessage,
    isWritable,
    mimeType,
    name,
    onDraftChange,
    onReloadRequested,
    onSaveRequested,
    onDiscardConflict,
    path,
    showPathLabel = true,
  } = props;

  const language = useMemo(() => guessLanguage(name, mimeType), [name, mimeType]);

  const handleBeforeMount = useCallback(
    (monaco: MonacoThemeApi) => {
      monacoRef.current = monaco;
      registerMonacoTheme(monaco, resolvedColorMode);
    },
    [resolvedColorMode],
  );

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return;
    }
    const themeId = registerMonacoTheme(monaco, resolvedColorMode);
    monaco.editor.setTheme(themeId);
  }, [resolvedColorMode]);

  const handleSave = useCallback(() => {
    if (busy || !dirty || !isWritable) return;
    onSaveRequested();
  }, [busy, dirty, isWritable, onSaveRequested]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSave) return;
      event.preventDefault();
      handleSave();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {showPathLabel ? (
            <p className="truncate text-xs text-text-secondary" title={path}>
              {path}
            </p>
          ) : null}
          {dirty ? (
            <span
              aria-label="Unsaved changes"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Reload"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-border hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onReloadRequested}
            title="Reload"
            type="button"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={busy ? "Saving" : "Save"}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !isWritable || !dirty}
            onClick={handleSave}
            title="Save (⌘/Ctrl+S)"
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!isWritable ? (
        <div className="border-b border-border bg-warning-surface px-4 py-2 text-xs text-warning-foreground">
          This root is read-only. Enable host-filesystem editing in Settings to save changes.
        </div>
      ) : null}
      {conflict ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-border bg-warning-surface px-4 py-3 text-sm text-warning-foreground">
          <span className="min-w-0">{conflict.message}</span>
          <div className="flex shrink-0 gap-2">
            <button
              className="cc-button cc-button-secondary"
              onClick={() => {
                onDiscardConflict();
                onReloadRequested();
              }}
              type="button"
            >
              Reload from disk
            </button>
            <button
              className="cc-button cc-button-secondary"
              disabled={busy}
              onClick={() => onSaveRequested(conflict.currentRevision)}
              type="button"
            >
              Overwrite
            </button>
          </div>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 sm:max-h-full max-h-[60vh]">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              Loading editor...
            </div>
          }
        >
          <MonacoEditor
            beforeMount={handleBeforeMount}
            value={draft}
            language={language}
            onChange={(value) => onDraftChange(value ?? "")}
            options={{
              minimap: { enabled: false },
              readOnly: !isWritable,
              automaticLayout: true,
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
            theme={getMonacoThemeId(resolvedColorMode)}
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
