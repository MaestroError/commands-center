import { useEffect, useState } from "react";

import type { TerminalSession } from "@cc/shared/schemas";

import { listTerminalSessions } from "@/lib/api";
import { useTerminalSessions } from "@/hooks/use-terminal-sessions";

export function useGlobalTerminalController() {
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

  return { controller, loadError };
}
