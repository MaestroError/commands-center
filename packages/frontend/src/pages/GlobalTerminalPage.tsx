import { useEffect, useState } from "react";
import { TerminalSquare } from "lucide-react";

import type { TerminalSession } from "@cc/shared/schemas";

import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { listTerminalSessions } from "@/lib/api";
import { TerminalTabsSurface } from "@/components/terminal/TerminalTabsSurface";
import { useTerminalSessions } from "@/hooks/use-terminal-sessions";

export function GlobalTerminalPage() {
  const [initialSessions, setInitialSessions] = useState<TerminalSession[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const controller = useTerminalSessions(initialSessions);

  useEffect(() => {
    listTerminalSessions()
      .then((sessions) => {
        setInitialSessions(sessions);
        setLoadError(undefined);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load terminal sessions.");
      });
  }, []);

  return (
    <WorkspaceLayout
      contextPane={{
        title: "Terminal details",
        tabs: [
          {
            id: "session",
            label: "Session",
            content: (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 text-text-primary">
                  <TerminalSquare className="h-4 w-4" />
                  <span className="font-medium">Global terminal</span>
                </div>
                {controller.activeSession ? (
                  <>
                    <DetailRow label="Session ID" value={controller.activeSession.id} />
                    <DetailRow label="Backend" value={controller.activeSession.backend} />
                    <DetailRow label="Working directory" value={controller.activeSession.cwd} />
                  </>
                ) : (
                  <p className="text-text-secondary">
                    Create or select a terminal session to inspect it.
                  </p>
                )}
                {loadError ? <p className="text-danger">{loadError}</p> : null}
              </div>
            ),
          },
        ],
      }}
      primary={<TerminalTabsSurface controller={controller} />}
    />
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
