import { useCallback, useEffect, useState } from "react";

import type { FileManagerFileRevision } from "@cc/shared/schemas";

import type { EditorTab, UseEditorTabs } from "@/hooks/use-editor-tabs";

import { EditorTabBar } from "./EditorTabBar";
import { MonacoFileEditor } from "./MonacoFileEditor";

type Props = {
  controller: UseEditorTabs;
};

export function EditorTabsSurface(props: Props) {
  const { controller } = props;
  const { activeTab, activeKey, tabs } = controller;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "w" && activeKey) {
        event.preventDefault();
        controller.close(activeKey);
        return;
      }
      if (event.key === "Tab" && tabs.length > 1 && activeKey) {
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.key === activeKey);
        if (index === -1) return;
        const delta = event.shiftKey ? -1 : 1;
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        if (next) controller.setActive(next.key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeKey, controller, tabs]);

  return (
    <div
      className="flex h-full min-h-[60vh] flex-col"
      data-testid="editor-tabs-surface"
      id="editor-surface-panel"
    >
      <EditorTabBar
        activeKey={controller.activeKey}
        onActivate={controller.setActive}
        onClose={controller.close}
        onMove={controller.move}
        tabs={controller.tabs}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab ? (
          <ActiveTabPane key={activeTab.key} controller={controller} tab={activeTab} />
        ) : (
          <EmptyEditorState />
        )}
      </div>
    </div>
  );
}

function ActiveTabPane(props: { tab: EditorTab; controller: UseEditorTabs }) {
  const { tab, controller } = props;
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conflict, setConflict] = useState<{
    currentRevision?: FileManagerFileRevision;
    message: string;
  }>();

  useEffect(() => {
    setBusy(false);
    setErrorMessage(undefined);
    setConflict(undefined);
  }, [tab.key]);

  const handleSave = useCallback(
    async (overrideRevision?: FileManagerFileRevision) => {
      if (busy) return;
      setBusy(true);
      setErrorMessage(undefined);
      try {
        const result = await controller.save(tab.key, { overrideRevision });
        if (result.ok) {
          setConflict(undefined);
        } else if (result.conflict !== undefined || result.error === undefined) {
          setConflict({
            currentRevision: result.conflict,
            message: "This file changed on disk since you opened it.",
          });
        } else {
          setErrorMessage(result.error);
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, controller, tab.key],
  );

  const handleReload = useCallback(() => {
    setConflict(undefined);
    setErrorMessage(undefined);
    void controller.reload(tab.key);
  }, [controller, tab.key]);

  if (tab.loading) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-text-secondary">
        Loading file...
      </div>
    );
  }

  if (tab.error) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-sm text-danger">
        <p>{tab.error}</p>
        <button className="cc-button cc-button-secondary" onClick={handleReload} type="button">
          Try again
        </button>
      </div>
    );
  }

  if (!tab.kind) {
    return null;
  }

  if (tab.kind === "text") {
    return (
      <MonacoFileEditor
        baseline={tab.baseline ?? ""}
        busy={busy}
        conflict={conflict}
        dirty={tab.dirty}
        draft={tab.draft ?? ""}
        errorMessage={errorMessage}
        isWritable={tab.isWritable ?? false}
        mimeType={tab.mimeType}
        name={tab.name}
        onDiscardConflict={() => setConflict(undefined)}
        onDraftChange={(draft) => controller.updateDraft(tab.key, draft)}
        onReloadRequested={handleReload}
        onSaveRequested={(override) => void handleSave(override)}
        path={tab.path}
      />
    );
  }

  if (tab.kind === "binary" && tab.mimeType && tab.binaryContentBase64) {
    if (tab.mimeType.startsWith("image/")) {
      return (
        <PreviewFrame name={tab.name} path={tab.path}>
          <img
            alt={tab.name}
            className="max-w-full rounded border border-border bg-surface sm:max-h-full"
            src={`data:${tab.mimeType};base64,${tab.binaryContentBase64}`}
          />
        </PreviewFrame>
      );
    }

    if (tab.mimeType.startsWith("video/")) {
      return (
        <PreviewFrame name={tab.name} path={tab.path}>
          <video
            className="max-w-full rounded border border-border bg-surface sm:max-h-full"
            controls
            src={`data:${tab.mimeType};base64,${tab.binaryContentBase64}`}
          />
        </PreviewFrame>
      );
    }
  }

  return <FallbackCard tab={tab} />;
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

function PreviewFrame(props: { name: string; path: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <PreviewHeader name={props.name} path={props.path} />
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

function FallbackCard(props: { tab: EditorTab }) {
  const { tab } = props;
  const reason =
    tab.kind === "too-large"
      ? "This file is larger than the 2 MB editor limit."
      : "This file type is not editable in-app.";

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <PreviewHeader name={tab.name} path={tab.path} />
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">{tab.name}</p>
          <p className="mt-2">{reason}</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-secondary">Path</dt>
            <dd className="break-all text-text-primary">{tab.path}</dd>
            {tab.revision ? (
              <>
                <dt className="text-text-secondary">Size</dt>
                <dd className="text-text-primary">{formatSize(tab.revision.sizeBytes)}</dd>
              </>
            ) : null}
            {tab.mimeType ? (
              <>
                <dt className="text-text-secondary">Type</dt>
                <dd className="text-text-primary">{tab.mimeType}</dd>
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
