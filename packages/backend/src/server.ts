import { randomUUID } from "node:crypto";
import Fastify from "fastify";

import type { RuntimeContext } from "./lib/start-server-runtime.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerProviderRoutes } from "./routes/providers.js";

export async function createServer(context: RuntimeContext) {
  const server = Fastify({
    loggerInstance: context.logger,
    genReqId(request) {
      return request.headers["x-request-id"]?.toString() ?? randomUUID();
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  server.get("/api/health", () => {
    return {
      status: "ok",
      dataDir: context.config.paths.dataDir,
      workspaceDir: context.config.paths.workspaceDir,
      database: {
        dialect: context.database.dialect,
        sqlitePath: context.database.sqlitePath,
      },
      opencode: context.orchestrator.getStatus(),
    };
  });

  server.get("/api/opencode", () => {
    return context.orchestrator.getStatus();
  });

  registerAgentRoutes(server, context);
  registerProviderRoutes(server, context);

  return server;
}
