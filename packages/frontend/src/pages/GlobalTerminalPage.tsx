import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { GlobalTerminalSurface } from "@/components/terminal/GlobalTerminalSurface";
import { useGlobalTerminalController } from "@/hooks/use-global-terminal-controller";
import { setSessionPrefillCommand } from "@/lib/terminal-prefill";

type TerminalLocationState = { runCommand?: string } | null;

export function GlobalTerminalPage() {
  const { controller, loadError, didHydrate } = useGlobalTerminalController();
  const location = useLocation();
  // Run each navigation's requested command at most once (location.key is unique
  // per navigation, so re-navigating with a new command re-triggers this).
  const handledNavKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const command = (location.state as TerminalLocationState)?.runCommand;
    if (!command || !didHydrate || handledNavKeyRef.current === location.key) {
      return;
    }
    handledNavKeyRef.current = location.key;
    // Always open a fresh session for the proposed command and scope the prefill
    // to it, so it lands in the new terminal even if others already exist.
    void controller.create().then((session) => {
      if (session) {
        setSessionPrefillCommand(session.id, command);
      }
    });
  }, [location.key, location.state, didHydrate, controller]);

  return (
    <WorkspaceLayout
      primary={<GlobalTerminalSurface controller={controller} loadError={loadError} />}
    />
  );
}
