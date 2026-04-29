import { X } from "lucide-react";

import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

import type { UseQuickFile } from "@/hooks/use-quick-file";

type Props = {
  controller: UseQuickFile;
  onClosePane?: () => void;
};

export function QuickFilePanel(props: Props) {
  if (!props.controller.file) {
    return null;
  }

  return (
    <div className="flex h-full flex-col" data-testid="quick-file-panel">
      <QuickFileHeader
        path={props.controller.file.displayPath ?? props.controller.file.path}
        onClose={() => {
          props.onClosePane?.();
        }}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceFileSurface
          busy={props.controller.busy}
          conflict={props.controller.conflict}
          errorMessage={props.controller.errorMessage}
          file={props.controller.file}
          showPreviewHeader={false}
          showTextPathLabel={false}
          onDiscardConflict={() => undefined}
          onDraftChange={props.controller.updateDraft}
          onReloadRequested={() => void props.controller.reload()}
          onSaveRequested={(overrideRevision) => void props.controller.save(overrideRevision)}
        />
      </div>
    </div>
  );
}

function QuickFileHeader(props: { path: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <p className="min-w-0 truncate text-sm text-text-primary [direction:rtl]" title={props.path}>
        {props.path}
      </p>
      <button
        aria-label="Close quick editor"
        className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
        onClick={props.onClose}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
