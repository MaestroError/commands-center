import { QuickInspectorSurface } from "./QuickInspectorSurface";

import type { UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";

type Props = {
  controller: UseChatInspectionTabs;
  onClosePane?: () => void;
};

export function QuickFilePanel(props: Props) {
  if (!props.controller.open || props.controller.tabs.length === 0) {
    return null;
  }

  return (
    <div data-testid="quick-file-panel">
      <QuickInspectorSurface controller={props.controller} />
    </div>
  );
}
