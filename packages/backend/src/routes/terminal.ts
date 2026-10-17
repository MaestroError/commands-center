import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { WebSocketServer } from "ws";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppServer } from "../lib/fastify-zod.js";
import { isOriginAllowed, readRequestOrigin } from "../lib/origin-check.js";
import { readOwnerSessionCookie } from "../lib/owner-session-cookie.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import {
  terminalCreateInputSchema,
  terminalListResponseSchema,
  terminalResizeInputSchema,
  terminalSessionResponseSchema,
} from "@cc/shared/schemas";
import { NotFoundError } from "../lib/api-error.js";
import {
  createNodePtyBackend,
  type NodePtyBackend,
} from "../services/terminal/node-pty-backend.js";

type TerminalContext = Pick<RuntimeContext, "config" | "logger" | "ownerAccessService">;

export function registerTerminalRoutes(server: AppServer, context: TerminalContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const backend = createNodePtyBackend({
    workspaceDirectory: context.config.paths.workspaceDir,
    logger: context.logger,
  });
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.server.on("upgrade", (request, socket, head) => {
    void handleTerminalUpgrade({ context, backend, request, socket, head, wsServer }).catch(
      (error: unknown) => {
        context.logger.error({ err: error }, "Terminal upgrade failed");
        socket.destroy();
      },
    );
  });

  server.addHook("preClose", async () => {
    for (const client of wsServer.clients) client.terminate();
    wsServer.close();
    await backend.dispose();
  });

  app.post(
    "/api/terminal",
    {
      schema: {
        body: terminalCreateInputSchema,
        response: {
          201: terminalSessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { cwd, shell } = request.body || {};
      const result = await backend.create({
        cwd,
        shell,
      });

      return reply.status(201).send(result);
    },
  );

  app.get(
    "/api/terminal",
    {
      schema: {
        response: {
          200: terminalListResponseSchema,
        },
      },
    },
    async () => {
      const sessions = await backend.list();
      return {
        sessions: [...sessions].sort((left, right) => right.createdAt - left.createdAt),
      };
    },
  );

  app.get(
    "/api/terminal/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: terminalSessionResponseSchema,
        },
      },
    },
    async (request) => {
      return findSession(backend, request.params.id);
    },
  );

  app.post(
    "/api/terminal/:id/resize",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: terminalResizeInputSchema,
      },
    },
    async (request, reply) => {
      await findSession(backend, request.params.id);
      await backend.resize(request.params.id, request.body.cols, request.body.rows);
      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/terminal/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      await findSession(backend, request.params.id);
      await backend.close(request.params.id);
      return reply.status(204).send();
    },
  );
}

async function findSession(backend: NodePtyBackend, id: string) {
  const sessions = [...(await backend.list())];
  const session = sessions.find((candidate) => candidate.id === id);

  if (!session) {
    throw new NotFoundError(`Terminal session not found: ${id}`);
  }

  return session;
}

async function handleTerminalUpgrade(options: {
  context: TerminalContext;
  backend: NodePtyBackend;
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  wsServer: WebSocketServer;
}) {
  const origin = `${options.request.headers.host ? `http://${options.request.headers.host}` : "http://localhost"}`;
  const requestUrl = new URL(options.request.url ?? "/", origin);
  const match = requestUrl.pathname.match(/^\/api\/terminal\/([^/]+)\/connect$/);

  if (!match) {
    return;
  }

  if (!(await isTerminalUpgradeAuthorized(options.context, options.request))) {
    options.socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    options.socket.destroy();
    return;
  }

  const sessionId = match[1];

  if (!sessionId) {
    options.socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    options.socket.destroy();
    return;
  }

  const session = await findSession(options.backend, sessionId).catch(() => undefined);

  if (!session) {
    options.socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    options.socket.destroy();
    return;
  }

  const backend = options.backend;
  const handle = await backend.attach(sessionId).catch(() => undefined);

  if (!handle) {
    options.socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    options.socket.destroy();
    return;
  }

  options.socket.once("close", () => handle.close());
  options.wsServer.handleUpgrade(options.request, options.socket, options.head, (ws) => {
    handle.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        if (ws.bufferedAmount > 1024 * 1024) {
          ws.terminate();
          return;
        }
        ws.send(data);
      }
    });

    handle.onExit(() => {
      if (ws.readyState === ws.OPEN) {
        ws.close();
      }
    });

    ws.on("message", (message) => {
      if (typeof message === "string") {
        handle.write(message);
        return;
      }

      if (message instanceof ArrayBuffer) {
        handle.write(Buffer.from(message).toString("utf8"));
        return;
      }

      if (Array.isArray(message)) {
        handle.write(Buffer.concat(message).toString("utf8"));
        return;
      }

      handle.write(message.toString("utf8"));
    });

    ws.on("close", () => {
      handle.close();
    });

    ws.on("error", () => {
      handle.close();
    });
  });
}

async function isTerminalUpgradeAuthorized(
  context: TerminalContext,
  request: IncomingMessage,
): Promise<boolean> {
  if (!context.ownerAccessService) {
    return true;
  }

  if (!isOriginAllowed({ config: context.config, origin: readRequestOrigin(request) })) {
    return false;
  }

  const sessionId = readOwnerSessionCookie(request.headers.cookie);

  return sessionId ? context.ownerAccessService.validateSession(sessionId) : false;
}
