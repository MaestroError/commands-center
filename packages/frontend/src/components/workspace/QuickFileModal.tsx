import { X } from "lucide-react";

import { WorkspaceFileSurface } from "./WorkspaceFileSurface";

import type { UseQuickFile } from "@/hooks/use-quick-file";

type Props = {
  controller: UseQuickFile;
  onClosePane?: () => void;
};

export function QuickFileModal(props: Props) {
  if (!props.controller.file) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-app-bg/85 p-3 backdrop-blur-sm xl:hidden"
      data-testid="quick-file-modal"
      onClick={() => {
        props.onClosePane?.();
      }}
    >
      <section
        className="cc-panel absolute inset-3 flex overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <ReverseTruncatePath
              path={props.controller.file.displayPath ?? props.controller.file.path}
            />
            <button
              aria-label="Close quick editor"
              className="cc-button cc-button-secondary inline-flex h-8 w-8 items-center justify-center p-0"
              onClick={() => {
                props.onClosePane?.();
              }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
      </section>
    </div>
  );
}

function ReverseTruncatePath(props: { path: string }) {
  return (
    <p className="min-w-0 truncate text-sm text-text-primary [direction:rtl]" title={props.path}>
      {props.path}
    </p>
  );
}
