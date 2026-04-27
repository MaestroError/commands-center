import { Terminal, X, Plus } from "lucide-react";

import type { TerminalSession } from "@cc/shared/schemas";

type Props = {
  sessions: TerminalSession[];
  activeId?: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

export function TerminalTabBar(props: Props) {
  return (
    <div
      className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-border bg-surface"
      role="tablist"
    >
      <button
        type="button"
        onClick={props.onNew}
        className="flex items-center gap-1.5 px-3 text-sm text-text-secondary hover:bg-background-hover hover:text-text-primary"
        title="New terminal"
        data-testid="new-terminal-btn"
      >
        <Plus className="h-4 w-4" />
        <span className="sr-only">New terminal</span>
      </button>
      {props.sessions.map((session) => (
        <TerminalTab
          key={session.id}
          session={session}
          active={session.id === props.activeId}
          onActivate={props.onActivate}
          onClose={props.onClose}
        />
      ))}
    </div>
  );
}

function TerminalTab(props: {
  session: TerminalSession;
  active: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    props.onClose(props.session.id);
  };

  const backendLabel = props.session.backend === "opencode" ? "OC" : "Root";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      onClick={() => props.onActivate(props.session.id)}
      className={[
        "group flex items-center gap-2 border-r border-border px-3 text-sm transition-colors",
        props.active
          ? "bg-background text-text-primary"
          : "bg-surface text-text-secondary hover:bg-background-hover hover:text-text-primary",
      ].join(" ")}
      data-testid={`terminal-tab-${props.session.id}`}
    >
      <Terminal className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[120px] truncate">{props.session.cwd.split("/").pop() || "/"}</span>
      <span
        className={["rounded px-1 text-xs", "bg-accent/20 text-accent"].join(" ")}
        title="OpenCode Engine"
      >
        {backendLabel}
      </span>
      <button
        type="button"
        onClick={handleClose}
        className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-background-hover group-hover:opacity-100"
        title="Close terminal"
        data-testid={`close-terminal-btn-${props.session.id}`}
      >
        <X className="h-3 w-3" />
      </button>
    </button>
  );
}
