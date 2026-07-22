import { randomUUID } from "node:crypto";
import Fastify from "fastify";

import { registerApiErrorHandler } from "./lib/api-error.js";
import { configureFastifyZod } from "./lib/fastify-zod.js";
import { registerOwnerAuthGuard } from "./lib/owner-auth-guard.js";
import { createPublicApiAuditHook } from "./lib/public-api-audit-hook.js";
import type { RuntimeContext } from "./lib/start-server-runtime.js";
import { registerOAuthProvider } from "./oauth/provider.js";
import { registerApiRoutes } from "./routes/index.js";

export function createServer(context: RuntimeContext) {
  const server = Fastify({
    loggerInstance: context.logger,
    forceCloseConnections: true,
    trustProxy: context.config.security.trustProxy,
    genReqId(request) {
      return request.headers["x-request-id"]?.toString() ?? randomUUID();
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });
  configureFastifyZod(server);
  registerOAuthProvider(server, context);

  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  server.addHook("preHandler", registerOwnerAuthGuard(context));

  server.addHook("onResponse", createPublicApiAuditHook(context));

  server.addHook("onClose", () => {
    context.taskExecutionService?.dispose();
  });

  server.setErrorHandler((error, request, reply) => {
    registerApiErrorHandler(request, reply, error);
  });

  registerApiRoutes(server, context);

  return server;
}
