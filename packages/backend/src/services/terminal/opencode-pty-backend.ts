import { z } from "zod";
import type { Logger } from "pino";
import type { TerminalBackend, TerminalSession, TerminalSessionHandle } from "@cc/shared/schemas";

import type { RuntimeConfig } from "../../lib/runtime-config.js";

const ptyInfoSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  status: z.enum(["running", "exited"]).optional(),
  pid: z.number().optional(),
});

interface OpenCodePtySession {
  id: string;
  cwd: string;
  createdAt: number;
  ws?: globalThis.WebSocket;
}

export function createOpenCodePtyBackend(options: {
  config: RuntimeConfig;
  logger: Logger;
  isAvailable?: () => boolean;
}): TerminalBackend {
  const { config, logger } = options;
  const sessions = new Map<string, OpenCodePtySession>();

  async function createPtySession(_options: {
    cwd?: string;
    shell?: string;
  }): Promise<TerminalSession> {
    const url = new URL("/pty", config.opencode.baseUrl);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: _options.cwd || process.env["HOME"] || "/",
        shell: _options.shell || "/bin/bash",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create PTY session: ${response.status} - ${error}`);
    }

    const result = ptyInfoSchema.parse(await response.json());
    const session: TerminalSession = {
      id: result.id,
      backend: "opencode",
      cwd: result.cwd ?? "",
      createdAt: Date.now(),
    };
    sessions.set(session.id, {
      id: session.id,
      cwd: session.cwd,
      createdAt: session.createdAt,
    });

    logger.info({ sessionId: session.id, cwd: session.cwd }, "Created OpenCode PTY session");
    return session;
  }

  async function attach(sessionId: string): Promise<TerminalSessionHandle> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const url = new URL(`/pty/${sessionId}/connect`, config.opencode.baseUrl);
    const ws = new globalThis.WebSocket(url);

    let onDataCallback: ((data: string) => void) | null = null;
    let onExitCallback: ((code: number) => void) | null = null;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (err) => {
        if (err instanceof Error) {
          reject(err);
        } else if (typeof err === "object" && err !== null) {
          reject(new Error(JSON.stringify(err)));
        } else {
          reject(new Error(String(err)));
        }
      };
    });

    session.ws = ws;

    ws.onmessage = (event) => {
      if (onDataCallback) {
        onDataCallback(event.data as string);
      }
    };

    ws.onclose = (event) => {
      if (onExitCallback) {
        onExitCallback(event.code);
      }
    };

    return {
      write: (data: string) => {
        if (ws.readyState === globalThis.WebSocket.OPEN) {
          ws.send(data);
        }
      },
      resize: (cols: number, rows: number) => {
        if (ws.readyState === globalThis.WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      },
      onData: (callback: (data: string) => void) => {
        onDataCallback = callback;
      },
      onExit: (callback: (code: number) => void) => {
        onExitCallback = callback;
      },
      close: () => {
        ws.close();
        if (sessions.get(sessionId)?.ws === ws) {
          delete session.ws;
        }
      },
    };
  }

  async function resize(_sessionId: string, _cols: number, _rows: number): Promise<void> {
    const response = await fetch(new URL(`/pty/${_sessionId}`, config.opencode.baseUrl), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: {
          cols: _cols,
          rows: _rows,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to resize PTY session: ${response.status} - ${error}`);
    }
  }

  async function close(sessionId: string): Promise<void> {
    const response = await fetch(new URL(`/pty/${sessionId}`, config.opencode.baseUrl), {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to close PTY session: ${response.status} - ${error}`);
    }

    const session = sessions.get(sessionId);
    if (session?.ws) {
      session.ws.close();
    }
    sessions.delete(sessionId);
    logger.info({ sessionId }, "Closed OpenCode PTY session");
  }

  async function list(): Promise<TerminalSession[]> {
    const url = new URL("/pty", config.opencode.baseUrl);
    const response = await fetch(url);

    if (!response.ok) {
      logger.warn({ status: response.status }, "Failed to list PTY sessions");
      return [];
    }

    const opencodeSessions = z.array(ptyInfoSchema).parse(await response.json());
    return opencodeSessions.map((s) => ({
      id: s.id,
      backend: "opencode" as const,
      cwd: s.cwd ?? "",
      createdAt: Date.now(),
    }));
  }

  function isAvailable(): boolean {
    return options.isAvailable?.() ?? true;
  }

  return {
    type: "opencode",
    create: createPtySession,
    attach,
    resize,
    close,
    list,
    isAvailable,
  };
}
