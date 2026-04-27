import { TerminalSquare } from "lucide-react";

import type { UseTerminalSessions } from "@/hooks/use-terminal-sessions";

import { TerminalTabsSurface } from "./TerminalTabsSurface";

type Props = {
  controller: UseTerminalSessions;
  loadError?: string;
  mode?: "page" | "pane";
};

export function GlobalTerminalSurface(props: Props) {
  if (props.mode === "pane") {
    return <TerminalTabsSurface controller={props.controller} />;
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="min-w-0 flex-1">
        <TerminalTabsSurface controller={props.controller} />
      </div>
      <aside className="cc-panel hidden w-72 shrink-0 lg:flex lg:flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-text-primary">
            <TerminalSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Global terminal</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm">
          {props.controller.activeSession ? (
            <>
              <DetailRow label="Session ID" value={props.controller.activeSession.id} />
              <DetailRow label="Backend" value={props.controller.activeSession.backend} />
              <DetailRow label="Working directory" value={props.controller.activeSession.cwd} />
            </>
          ) : (
            <p className="text-text-secondary">
              Create or select a terminal session to inspect it.
            </p>
          )}
          {props.loadError ? <p className="text-danger">{props.loadError}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-text-secondary">{props.label}</p>
      <p className="mt-1 break-all text-text-primary">{props.value}</p>
    </div>
  );
}
