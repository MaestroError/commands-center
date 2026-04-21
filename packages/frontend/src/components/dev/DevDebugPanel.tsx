import { useCallback, useEffect, useState } from "react";
import type { ChatEvent } from "@cc/shared/schemas";

type DevDebugPanelProps = {
  injectEvent: (event: ChatEvent) => void;
  /** Latest assistant message ID to attach tool parts to */
  messageId: string | undefined;
  sessionId: string;
};

let counter = 0;
function uid() {
  return `debug-${String(Date.now())}-${String(++counter)}`;
}

export function DevDebugPanel({ injectEvent, messageId, sessionId }: DevDebugPanelProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const injectPart = useCallback(
    (part: Record<string, unknown>) => {
      if (!messageId) return;
      injectEvent({
        type: "message.part.updated",
        properties: {
          sessionID: sessionId,
          messageID: messageId,
          part: { id: uid(), type: "tool", ...part } as never,
        },
      });
    },
    [injectEvent, messageId, sessionId],
  );

  const injectTodos = useCallback(() => {
    injectEvent({
      type: "todo.updated",
      properties: {
        sessionID: sessionId,
        todos: [
          {
            content: "Research Node.js ORMs",
            status: "completed",
            activeForm: "Researching Node.js ORMs",
          },
          {
            content: "Create comparison table",
            status: "in_progress",
            activeForm: "Creating comparison table",
          },
          {
            content: "Write recommendation",
            status: "pending",
            activeForm: "Writing recommendation",
          },
        ],
      },
    });
  }, [injectEvent, sessionId]);

  const clearTodos = useCallback(() => {
    injectEvent({
      type: "todo.updated",
      properties: { sessionID: sessionId, todos: [] },
    });
  }, [injectEvent, sessionId]);

  const injectBash = useCallback(() => {
    injectPart({
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "ls -la src/", description: "List source directory" },
        output:
          "total 32\ndrwxr-xr-x  8 user staff  256 Apr 19 10:00 .\ndrwxr-xr-x  5 user staff  160 Apr 19 09:30 ..\n-rw-r--r--  1 user staff 1234 Apr 19 10:00 index.ts\n-rw-r--r--  1 user staff  567 Apr 19 09:45 utils.ts\ndrwxr-xr-x  3 user staff   96 Apr 19 09:30 components",
      },
    });
  }, [injectPart]);

  const injectContextGroup = useCallback(() => {
    injectPart({
      tool: "read",
      state: { status: "completed", input: { path: "src/index.ts" } },
    });
    injectPart({
      tool: "glob",
      state: { status: "completed", input: { pattern: "**/*.test.ts" } },
    });
    injectPart({
      tool: "grep",
      state: { status: "completed", input: { pattern: "import.*react" } },
    });
  }, [injectPart]);

  const injectError = useCallback(() => {
    injectPart({
      tool: "bash",
      state: {
        status: "error",
        input: { command: "rm -rf /protected" },
        error:
          "Permission denied: cannot remove '/protected': Operation not permitted\n\nThis command requires elevated privileges.",
      },
    });
  }, [injectPart]);

  const injectQuestion = useCallback(() => {
    injectPart({
      tool: "question",
      state: {
        status: "completed",
        input: {
          questions: [
            {
              question: "Which database should we use?",
              options: [{ label: "PostgreSQL" }, { label: "SQLite" }],
            },
            { question: "Include migrations?", options: [{ label: "Yes" }, { label: "No" }] },
          ],
        },
        metadata: {
          answers: [["PostgreSQL"], ["Yes"]],
        },
      },
    });
  }, [injectPart]);

  const injectTask = useCallback(() => {
    injectPart({
      tool: "agent",
      state: {
        status: "completed",
        input: {
          subagent_type: "explore",
          description: "Search for all API route handlers in the codebase",
        },
      },
    });
  }, [injectPart]);

  if (!visible) return null;

  const btn =
    "px-2 py-1 text-xs rounded-md bg-surface-elevated hover:bg-accent/10 text-text-primary transition border border-border";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 rounded-md border border-border bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-text-primary">Debug Panel</span>
        <button
          type="button"
          className="text-xs text-text-secondary hover:text-text-primary"
          onClick={() => setVisible(false)}
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
          Todos
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={btn} onClick={injectTodos}>
            Inject Todos
          </button>
          <button type="button" className={btn} onClick={clearTodos}>
            Clear
          </button>
        </div>

        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mt-2">
          Tool Parts {!messageId && "(need a message)"}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={injectBash} disabled={!messageId}>
            Bash
          </button>
          <button type="button" className={btn} onClick={injectContextGroup} disabled={!messageId}>
            Context Group
          </button>
          <button type="button" className={btn} onClick={injectError} disabled={!messageId}>
            Error
          </button>
          <button type="button" className={btn} onClick={injectQuestion} disabled={!messageId}>
            Question
          </button>
          <button type="button" className={btn} onClick={injectTask} disabled={!messageId}>
            Task
          </button>
        </div>

        <span className="text-[10px] text-text-secondary mt-2">Ctrl+Shift+D to toggle</span>
      </div>
    </div>
  );
}
