import { ChatSidePaneHost } from "@/components/chat/ChatSidePaneHost";

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
    <div data-testid="quick-file-panel">
      <ChatSidePaneHost
        closeLabel="Close quick editor"
        onClose={() => {
          props.onClosePane?.();
        }}
        title={props.controller.file.displayPath ?? props.controller.file.path}
        titleClassName="[direction:rtl]"
      >
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
      </ChatSidePaneHost>
    </div>
  );
}
