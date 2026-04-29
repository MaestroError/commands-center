import { useCallback, useEffect, useState } from "react";

import type { FileManagerFileRevision } from "@cc/shared/schemas";

import type { EditorTab, UseEditorTabs } from "@/hooks/use-editor-tabs";

import { EditorTabBar } from "./EditorTabBar";
import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

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
    return <WorkspaceFileSurface file={tab} />;
  }

  return (
    <WorkspaceFileSurface
      busy={busy}
      conflict={conflict}
      errorMessage={errorMessage}
      file={tab}
      onDiscardConflict={() => setConflict(undefined)}
      onDraftChange={(draft) => controller.updateDraft(tab.key, draft)}
      onReloadRequested={handleReload}
      onSaveRequested={(override) => void handleSave(override)}
    />
  );
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
