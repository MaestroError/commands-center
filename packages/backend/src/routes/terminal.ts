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
import { createTerminalBackendFactory } from "../services/terminal-backend.js";

export function registerTerminalRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const factory = createTerminalBackendFactory({
    config: context.config,
    logger: context.logger,
    orchestrator: context.orchestrator,
  });
  const wsServer = new WebSocketServer({ noServer: true });

  server.server.on("upgrade", (request, socket, head) => {
    void handleTerminalUpgrade({ context, factory, request, socket, head, wsServer });
  });

  server.addHook("onClose", () => {
    wsServer.close();
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
      const { backend, cwd, shell } = request.body || {};
      const result = await factory.createWithFallback({
        preferred: backend,
        cwd,
        shell,
      });

      return reply.status(201).send(result.session);
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
      const openCodeSessions = await factory.openCodeBackend.list();
      return {
        sessions: [...openCodeSessions].sort((left, right) => right.createdAt - left.createdAt),
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
      return findSession(factory, request.params.id);
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
      const session = await findSession(factory, request.params.id);
      const backend = factory.create(session.backend);
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
      const session = await findSession(factory, request.params.id);
      const backend = factory.create(session.backend);
      await backend.close(request.params.id);
      return reply.status(204).send();
    },
  );
}

async function findSession(factory: ReturnType<typeof createTerminalBackendFactory>, id: string) {
  const sessions = [...(await factory.openCodeBackend.list())];
  const session = sessions.find((candidate) => candidate.id === id);

  if (!session) {
    throw new NotFoundError(`Terminal session not found: ${id}`);
  }

  return session;
}

async function handleTerminalUpgrade(options: {
  context: RuntimeContext;
  factory: ReturnType<typeof createTerminalBackendFactory>;
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

  const session = await findSession(options.factory, sessionId).catch(() => undefined);

  if (!session) {
    options.socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    options.socket.destroy();
    return;
  }

  const backend = options.factory.create(session.backend);
  const handle = await backend.attach(sessionId).catch(() => undefined);

  if (!handle) {
    options.socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    options.socket.destroy();
    return;
  }

  options.wsServer.handleUpgrade(options.request, options.socket, options.head, (ws) => {
    handle.onData((data) => {
      if (ws.readyState === ws.OPEN) {
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
  context: RuntimeContext,
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
