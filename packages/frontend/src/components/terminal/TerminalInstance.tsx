import { useEffect, useRef } from "react";

import type { TerminalSession } from "@cc/shared/schemas";
import type { FitAddon } from "@xterm/addon-fit";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

import { connectTerminalWebSocket } from "@/lib/api";
import { consumeSessionPrefillCommand } from "@/lib/terminal-prefill";
import { useTheme } from "@/context/use-theme";

import { buildXtermTheme } from "./xterm-theme";

type Props = {
  session: TerminalSession;
  onResize: (cols: number, rows: number) => void;
  onExit: () => void;
};

type XTermInstance = InstanceType<typeof Terminal>;
type FitAddonInstance = InstanceType<typeof FitAddon>;
type SerializeAddonInstance = InstanceType<typeof SerializeAddon>;
type WebLinksAddonInstance = InstanceType<typeof WebLinksAddon>;

const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 4_000;
const RESIZE_DEBOUNCE_MS = 120;
const BUFFER_SNAPSHOT_SCROLLBACK = 150;
const OUTPUT_FLUSH_INTERVAL_MS = 16;

function getTerminalBufferSnapshotKey(sessionId: string) {
  return `cc.global-terminal.buffer.${sessionId}`;
}

function stripTerminalControlFrames(text: string) {
  return text.replace(/\{\s*"cursor"\s*:\s*\d+\s*\}/g, "");
}

export function TerminalInstance(props: Props) {
  const { session, onResize, onExit } = props;
  const { resolvedColorMode } = useTheme();
  const resolvedColorModeRef = useRef(resolvedColorMode);
  resolvedColorModeRef.current = resolvedColorMode;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermInstance | null>(null);
  const fitAddonRef = useRef<FitAddonInstance | null>(null);
  const serializeAddonRef = useRef<SerializeAddonInstance | null>(null);
  const webLinksAddonRef = useRef<WebLinksAddonInstance | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const connectedOnceRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let dataDisposable: { dispose?: () => void } | undefined;
    let cleanupClipboardHandlers: (() => void) | undefined;
    const bufferSnapshotKey = getTerminalBufferSnapshotKey(session.id);
    const pendingOutput: string[] = [];
    let outputFlushTimeout: number | null = null;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const clearResizeTimeout = () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };

    const flushPendingOutput = (terminal: XTermInstance, callback?: () => void) => {
      if (pendingOutput.length === 0) {
        callback?.();
        return;
      }

      const chunk = pendingOutput.join("");
      pendingOutput.length = 0;
      terminal.write(chunk, () => callback?.());
    };

    const clearOutputFlushTimeout = () => {
      if (outputFlushTimeout !== null) {
        window.clearTimeout(outputFlushTimeout);
        outputFlushTimeout = null;
      }
    };

    const queueOutput = (terminal: XTermInstance, data: string) => {
      const sanitized = stripTerminalControlFrames(data);
      if (!sanitized) {
        return;
      }

      pendingOutput.push(sanitized);
      if (outputFlushTimeout !== null) {
        return;
      }

      outputFlushTimeout = window.setTimeout(() => {
        outputFlushTimeout = null;
        if (disposed) {
          return;
        }
        flushPendingOutput(terminal);
      }, OUTPUT_FLUSH_INTERVAL_MS);
    };

    const emitResizeIfChanged = (terminal: XTermInstance) => {
      const nextSize = { cols: terminal.cols, rows: terminal.rows };
      if (
        lastSizeRef.current?.cols === nextSize.cols &&
        lastSizeRef.current?.rows === nextSize.rows
      ) {
        return;
      }

      lastSizeRef.current = nextSize;
      onResize(nextSize.cols, nextSize.rows);
    };

    const scheduleResize = (terminal: XTermInstance) => {
      clearResizeTimeout();
      resizeTimeoutRef.current = window.setTimeout(() => {
        resizeTimeoutRef.current = null;
        if (disposed) {
          return;
        }
        emitResizeIfChanged(terminal);
      }, RESIZE_DEBOUNCE_MS);
    };

    const handleTerminalExit = (terminal: XTermInstance) => {
      clearReconnectTimeout();
      reconnectAttemptsRef.current = 0;
      window.localStorage.removeItem(bufferSnapshotKey);
      queueOutput(terminal, "\r\n[terminal exited]\r\n");
      flushPendingOutput(terminal, onExit);
    };

    const scheduleReconnect = (terminal: XTermInstance) => {
      queueOutput(terminal, "\r\n[terminal connection lost, retrying]\r\n");
      clearReconnectTimeout();
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** Math.min(reconnectAttemptsRef.current, 4),
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectSocket(terminal);
      }, delay);
    };

    const connectSocket = (terminal: XTermInstance) => {
      if (disposed) {
        return;
      }

      const previousSocket = wsRef.current;
      if (
        previousSocket &&
        (previousSocket.readyState === WebSocket.OPEN ||
          previousSocket.readyState === WebSocket.CONNECTING)
      ) {
        previousSocket.close(1000);
      }

      const ws = connectTerminalWebSocket(session.id);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed || wsRef.current !== ws) {
          return;
        }

        clearReconnectTimeout();
        reconnectAttemptsRef.current = 0;
        const isFirstConnect = !connectedOnceRef.current;
        queueOutput(
          terminal,
          isFirstConnect ? "\r\n[terminal connected]\r\n" : "\r\n[terminal reconnected]\r\n",
        );
        connectedOnceRef.current = true;
        scheduleResize(terminal);

        // Prefill a command handed off from the activity feed's "Run command"
        // action. Sent without a trailing newline so the operator reviews and
        // runs it. Only on the very first connect, never on reconnects.
        if (isFirstConnect) {
          const pendingCommand = consumeSessionPrefillCommand(session.id);
          if (pendingCommand) {
            ws.send(pendingCommand);
          }
        }
      };

      ws.onmessage = (event) => {
        if (disposed || wsRef.current !== ws) {
          return;
        }

        if (typeof event.data === "string") {
          queueOutput(terminal, event.data);
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.text().then((text) => {
            if (disposed || wsRef.current !== ws) {
              return;
            }
            queueOutput(terminal, text);
          });
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          queueOutput(terminal, new TextDecoder().decode(event.data));
          return;
        }

        queueOutput(terminal, String(event.data));
      };

      ws.onerror = () => {
        if (disposed || wsRef.current !== ws) {
          return;
        }
        queueOutput(terminal, "\r\n[terminal connection error]\r\n");
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        if (disposed) {
          return;
        }

        if (event.code === 1000) {
          queueOutput(terminal, "\r\n[terminal disconnected]\r\n");
          return;
        }

        if (!connectedOnceRef.current) {
          queueOutput(terminal, "\r\n[terminal connection failed]\r\n");
          return;
        }

        if (event.code === 1005 || event.code === 1006) {
          void fetch(`/api/terminal/${session.id}`)
            .then((response) => {
              if (disposed) {
                return;
              }

              if (response.status === 404) {
                handleTerminalExit(terminal);
                return;
              }

              scheduleReconnect(terminal);
            })
            .catch(() => {
              if (disposed) {
                return;
              }
              scheduleReconnect(terminal);
            });
          return;
        }

        scheduleReconnect(terminal);
      };
    };

    void (async () => {
      await import("@xterm/xterm/css/xterm.css");
      const [{ Terminal }, { FitAddon }, { SerializeAddon }, { WebLinksAddon }] = await Promise.all(
        [
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-serialize"),
          import("@xterm/addon-web-links"),
        ],
      );

      if (disposed || !containerRef.current) {
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        theme: buildXtermTheme(resolvedColorModeRef.current),
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      const serializeAddon = new SerializeAddon();
      const linkHandler = (event: MouseEvent, uri: string) => {
        const mouseEvent = event as MouseEvent | undefined;
        if (!mouseEvent?.metaKey && !mouseEvent?.ctrlKey) {
          return;
        }

        window.open(uri, "_blank", "noopener,noreferrer");
      };
      const webLinksAddon = new WebLinksAddon(linkHandler);
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(serializeAddon);
      terminal.loadAddon(webLinksAddon);

      terminal.open(containerRef.current);
      terminal.focus();
      const restoreBuffer = window.localStorage.getItem(bufferSnapshotKey);
      if (restoreBuffer) {
        queueOutput(terminal, restoreBuffer);
        flushPendingOutput(terminal);
      }
      fitAddon.fit();
      scheduleResize(terminal);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      serializeAddonRef.current = serializeAddon;
      webLinksAddonRef.current = webLinksAddon;

      const terminalElement = containerRef.current.querySelector(".xterm");
      if (terminalElement) {
        const handleCopy: EventListener = (event) => {
          const clipboardEvent = event as ClipboardEvent;
          const selection = terminal.getSelection();
          if (!selection) {
            return;
          }

          clipboardEvent.preventDefault();
          clipboardEvent.clipboardData?.setData("text/plain", selection);
          void navigator.clipboard.writeText(selection).catch(() => undefined);
        };

        terminalElement.addEventListener("copy", handleCopy, true);
        cleanupClipboardHandlers = () => {
          terminalElement.removeEventListener("copy", handleCopy, true);
        };
      }

      connectSocket(terminal);

      dataDisposable = terminal.onData((data) => {
        const activeSocket = wsRef.current;
        if (activeSocket?.readyState === WebSocket.OPEN) {
          activeSocket.send(data);
        }
      });

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        scheduleResize(terminal);
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      clearReconnectTimeout();
      clearResizeTimeout();
      clearOutputFlushTimeout();
      lastSizeRef.current = null;
      reconnectAttemptsRef.current = 0;
      connectedOnceRef.current = false;
      dataDisposable?.dispose?.();
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000);
      }
      wsRef.current = null;
      fitAddonRef.current = null;
      const snapshot = serializeAddonRef.current
        ?.serialize({ scrollback: BUFFER_SNAPSHOT_SCROLLBACK })
        .trim();
      if (snapshot) {
        window.localStorage.setItem(bufferSnapshotKey, snapshot);
      }
      webLinksAddonRef.current = null;
      serializeAddonRef.current = null;
      cleanupClipboardHandlers?.();
      if (terminalRef.current) {
        flushPendingOutput(terminalRef.current, () => {
          terminalRef.current?.dispose();
          terminalRef.current = null;
        });
      }
      terminalRef.current = null;
      resizeObserver?.disconnect();
    };
  }, [session.id, onExit, onResize]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = buildXtermTheme(resolvedColorMode);
    }
  }, [resolvedColorMode]);

  return (
    <div
      className="h-full w-full overflow-hidden bg-surface-elevated"
      data-testid={`terminal-instance-${session.id}`}
    >
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
