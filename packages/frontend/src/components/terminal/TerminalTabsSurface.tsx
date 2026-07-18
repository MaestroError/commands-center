import { useCallback, useEffect } from "react";
import { Terminal } from "lucide-react";

import type { UseTerminalSessions } from "@/hooks/use-terminal-sessions";

import { TerminalTabBar } from "./TerminalTabBar";
import { TerminalInstance } from "./TerminalInstance";
import { Button } from "@/components/ui/button";

type Props = {
  controller: UseTerminalSessions;
};

export function TerminalTabsSurface(props: Props) {
  const { sessions, activeId, activeSession, create, close, setActive, resize, isLoading, error } =
    props.controller;

  const handleNew = useCallback(() => {
    void create();
  }, [create]);

  const handleResize = useCallback(
    (id: string, cols: number, rows: number) => {
      void resize(id, cols, rows);
    },
    [resize],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        handleNew();
        return;
      }

      if (key === "w" && activeId) {
        event.preventDefault();
        void close(activeId);
        return;
      }

      if (event.key !== "Tab" || sessions.length <= 1 || !activeId) {
        return;
      }

      event.preventDefault();
      const index = sessions.findIndex((session) => session.id === activeId);
      if (index === -1) {
        return;
      }

      const delta = event.shiftKey ? -1 : 1;
      const next = sessions[(index + delta + sessions.length) % sessions.length];
      if (next) {
        setActive(next.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, close, handleNew, sessions, setActive]);

  return (
    <div className="flex h-full flex-col" data-testid="terminal-tabs-surface">
      <TerminalTabBar
        sessions={sessions}
        activeId={activeId}
        onActivate={setActive}
        onClose={(id) => void close(id)}
        onNew={handleNew}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="flex h-full items-center justify-center p-4 text-danger">
            <p>{error}</p>
          </div>
        )}
        {isLoading && sessions.length === 0 && (
          <div className="flex h-full items-center justify-center text-text-secondary">
            <p>Creating terminal session...</p>
          </div>
        )}
        {!isLoading && sessions.length === 0 && <EmptyTerminalState onNew={() => handleNew()} />}
        {activeSession && !isLoading && (
          <TerminalInstance
            key={activeSession.id}
            session={activeSession}
            onResize={(cols, rows) => handleResize(activeSession.id, cols, rows)}
            onExit={() => props.controller.remove(activeSession.id)}
          />
        )}
      </div>
    </div>
  );
}

function EmptyTerminalState(props: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-text-secondary">
      <Terminal className="h-12 w-12 opacity-50" />
      <div className="max-w-md text-center">
        <p className="mb-1 font-medium text-text-primary">No terminal sessions</p>
        <p className="mb-4">Click the + button or press Ctrl+T to create a new terminal.</p>
      </div>
      <Button type="button" onClick={props.onNew}>
        New Terminal
      </Button>
    </div>
  );
}
