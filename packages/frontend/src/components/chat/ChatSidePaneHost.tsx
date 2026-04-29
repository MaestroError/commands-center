import { X } from "lucide-react";

import type { ReactNode } from "react";

type ChatSidePaneHostProps = {
  title: string;
  titleClassName?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
};

export function ChatSidePaneHost(props: ChatSidePaneHostProps) {
  return (
    <div className="flex h-full flex-col" data-testid="chat-side-pane-host">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <p
          className={[
            "min-w-0 truncate text-sm text-text-primary",
            props.titleClassName ?? "",
          ].join(" ")}
          title={props.title}
        >
          {props.title}
        </p>
        <button
          aria-label={props.closeLabel ?? "Close side pane"}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
          onClick={props.onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{props.children}</div>
    </div>
  );
}
