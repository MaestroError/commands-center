import { X } from "lucide-react";

import { QuickInspectorSurface } from "./QuickInspectorSurface";

import type { UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";

type Props = {
  controller: UseChatInspectionTabs;
  onClosePane?: () => void;
};

export function QuickFileModal(props: Props) {
  if (!props.controller.open || props.controller.tabs.length === 0) {
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
            <p className="min-w-0 truncate text-sm text-text-primary">Inspection</p>
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
            <QuickInspectorSurface controller={props.controller} />
          </div>
        </div>
      </section>
    </div>
  );
}
