import { useEffect, useState } from "react";

import type { TerminalSession } from "@cc/shared/schemas";

import { listTerminalSessions } from "@/lib/api";
import { useTerminalSessions } from "@/hooks/use-terminal-sessions";

export function useGlobalTerminalController(options?: { defaultCwd?: string }) {
  const [initialSessions, setInitialSessions] = useState<TerminalSession[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [didHydrate, setDidHydrate] = useState(false);
  const controller = useTerminalSessions(initialSessions);

  useEffect(() => {
    listTerminalSessions()
      .then((sessions) => {
        setInitialSessions(sessions);
        setLoadError(undefined);
        setDidHydrate(true);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load terminal sessions.");
        setDidHydrate(true);
      });
  }, []);

  const createWithDefaultCwd = (input?: { cwd?: string }) =>
    controller.create({ cwd: input?.cwd ?? options?.defaultCwd });

  return {
    controller: {
      ...controller,
      create: createWithDefaultCwd,
    },
    loadError,
    didHydrate,
    initialSessionCount: initialSessions.length,
  };
}
