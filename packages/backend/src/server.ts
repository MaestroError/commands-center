import { randomUUID } from "node:crypto";
import Fastify from "fastify";

import { registerApiErrorHandler } from "./lib/api-error.js";
import { configureFastifyZod } from "./lib/fastify-zod.js";
import type { RuntimeContext } from "./lib/start-server-runtime.js";
import { registerApiRoutes } from "./routes/index.js";

export function createServer(context: RuntimeContext) {
  const server = Fastify({
    loggerInstance: context.logger,
    genReqId(request) {
      return request.headers["x-request-id"]?.toString() ?? randomUUID();
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });
  configureFastifyZod(server);

  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  server.setErrorHandler((error, request, reply) => {
    registerApiErrorHandler(request, reply, error);
  });

  registerApiRoutes(server, context);

  return server;
}
