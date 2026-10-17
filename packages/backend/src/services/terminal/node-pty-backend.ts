import { userInfo } from "node:os";
import { realpath } from "node:fs/promises";
import { spawn, type IPty } from "node-pty";
import { ulid } from "ulid";
import type { Logger } from "pino";
import type { TerminalBackend, TerminalSession, TerminalSessionHandle } from "@cc/shared/schemas";
import { NotFoundError } from "../../lib/api-error.js";

const MAX_REPLAY_LENGTH = 256 * 1024;

type Attachment = { data?: (data: string) => void; exit?: (code: number) => void };
type Session = {
  info: TerminalSession;
  process: IPty;
  replay: string;
  attachments: Set<Attachment>;
  exited: Promise<void>;
  exitCode?: number;
};
export type NodePtyBackend = TerminalBackend & { dispose(): Promise<void> };

export function createNodePtyBackend(options: {
  workspaceDirectory: string;
  logger: Logger;
}): NodePtyBackend {
  const sessions = new Map<string, Session>();
  let disposed = false;

  function get(id: string): Session {
    const session = sessions.get(id);
    if (!session) throw new NotFoundError(`Terminal session not found: ${id}`);
    return session;
  }

  async function create(input: { cwd?: string; shell?: string }): Promise<TerminalSession> {
    const cwd = await realpath(input.cwd || options.workspaceDirectory);
    if (disposed) throw new Error("Terminal backend is closed");
    const shell =
      input.shell ||
      (process.platform === "win32"
        ? process.env["COMSPEC"] || "cmd.exe"
        : process.env["SHELL"] || userInfo().shell || "/bin/sh");
    const child = spawn(shell, [], {
      cwd,
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      env: process.env,
    });
    const info: TerminalSession = { id: ulid(), backend: "local", cwd, createdAt: Date.now() };
    const completion = Promise.withResolvers<void>();
    const session: Session = {
      info,
      process: child,
      replay: "",
      attachments: new Set(),
      exited: completion.promise,
    };
    sessions.set(info.id, session);
    const dataListener = child.onData((data) => {
      session.replay = (session.replay + data).slice(-MAX_REPLAY_LENGTH);
      if (/^[\uDC00-\uDFFF]/u.test(session.replay)) session.replay = session.replay.slice(1);
      for (const attachment of session.attachments) attachment.data?.(data);
    });
    const exitListener = child.onExit(({ exitCode }) => {
      session.exitCode = exitCode;
      sessions.delete(info.id);
      for (const attachment of session.attachments) attachment.exit?.(exitCode);
      session.attachments.clear();
      dataListener.dispose();
      exitListener.dispose();
      completion.resolve();
      options.logger.debug({ sessionId: info.id, exitCode }, "Terminal exited");
    });
    return info;
  }

  function attach(id: string): Promise<TerminalSessionHandle> {
    return Promise.resolve().then(() => {
      const session = get(id);
      const attachment: Attachment = {};
      session.attachments.add(attachment);
      let detached = false;
      return {
        write: (data) => {
          if (!detached && session.exitCode === undefined) session.process.write(data);
        },
        resize: (cols, rows) => {
          if (!detached && session.exitCode === undefined) session.process.resize(cols, rows);
        },
        onData: (callback) => {
          if (detached) return;
          attachment.data = callback;
          callback("\x1bc" + session.replay);
        },
        onExit: (callback) => {
          if (detached) return;
          attachment.exit = callback;
          if (session.exitCode !== undefined) callback(session.exitCode);
        },
        close: () => {
          detached = true;
          session.attachments.delete(attachment);
        },
      };
    });
  }

  async function close(id: string): Promise<void> {
    const session = get(id);
    session.process.kill();
    const escalation = setTimeout(() => {
      if (session.exitCode === undefined) session.process.kill("SIGKILL");
    }, 1000);
    try {
      await session.exited;
    } finally {
      clearTimeout(escalation);
    }
  }

  return {
    type: "local",
    create,
    attach,
    close,
    resize: (id, cols, rows) => {
      get(id).process.resize(cols, rows);
      return Promise.resolve();
    },
    list: () => Promise.resolve([...sessions.values()].map((session) => session.info)),
    isAvailable: () => !disposed,
    dispose: async () => {
      disposed = true;
      await Promise.all([...sessions.keys()].map(close));
    },
  };
}
