import type { ReactNode } from "react";

type ChatSplitPaneLayoutProps = {
  main: ReactNode;
  sidePane?: ReactNode;
};

export function ChatSplitPaneLayout(props: ChatSplitPaneLayoutProps) {
  if (!props.sidePane) {
    return <div className="min-h-0 flex-1 overflow-hidden">{props.main}</div>;
  }

  return (
    <div className="min-h-0 flex flex-1 overflow-hidden" data-testid="chat-split-pane-layout">
      <div className="min-w-0 flex-1 overflow-hidden border-r border-border">{props.main}</div>
      <aside className="flex w-[min(48%,56rem)] min-w-[24rem] max-w-[56rem] flex-col overflow-hidden bg-app-bg">
        {props.sidePane}
      </aside>
    </div>
  );
}
