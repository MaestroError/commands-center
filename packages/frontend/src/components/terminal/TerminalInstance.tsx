import { useEffect, useRef } from "react";

import type { TerminalSession } from "@cc/shared/schemas";
import type { FitAddon } from "@xterm/addon-fit";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

import { connectTerminalWebSocket } from "@/lib/api";

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

export function TerminalInstance(props: Props) {
  const { session, onResize, onExit } = props;
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
      pendingOutput.push(data);
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
        queueOutput(
          terminal,
          connectedOnceRef.current
            ? "\r\n[terminal reconnected]\r\n"
            : "\r\n[terminal connected]\r\n",
        );
        connectedOnceRef.current = true;
        scheduleResize(terminal);
      };

      ws.onmessage = (event) => {
        if (disposed || wsRef.current !== ws) {
          return;
        }
        queueOutput(terminal, typeof event.data === "string" ? event.data : String(event.data));
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
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          cursorAccent: "#1e1e1e",
          selectionBackground: "#264f78",
          black: "#181818",
          red: "#f44747",
          green: "#608b4e",
          yellow: "#dcdcaa",
          blue: "#569cd6",
          magenta: "#c586c0",
          cyan: "#4ec9b0",
          white: "#d4d4d4",
          brightBlack: "#6a6a6a",
          brightRed: "#ff6b6b",
          brightGreen: "#8cc265",
          brightYellow: "#f5f5a5",
          brightBlue: "#7db7ff",
          brightMagenta: "#d7a6d1",
          brightCyan: "#7fe7d5",
          brightWhite: "#ffffff",
        },
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

        const handlePaste: EventListener = (event) => {
          const clipboardEvent = event as ClipboardEvent;
          const text = clipboardEvent.clipboardData?.getData("text/plain");
          if (!text) {
            return;
          }

          clipboardEvent.preventDefault();
          terminal.paste(text);
        };

        terminalElement.addEventListener("copy", handleCopy, true);
        terminalElement.addEventListener("paste", handlePaste, true);
        cleanupClipboardHandlers = () => {
          terminalElement.removeEventListener("copy", handleCopy, true);
          terminalElement.removeEventListener("paste", handlePaste, true);
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

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-surface-elevated p-2"
      data-testid={`terminal-instance-${session.id}`}
    />
  );
}
