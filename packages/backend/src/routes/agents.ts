import { z } from "zod";

import type { FastifyReply } from "fastify";

import { createAgentInputSchema, updateAgentInputSchema } from "../schemas/agents.js";

import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createAgentService } from "../services/agent-service.js";

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const listAgentsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
});

type RouteServer = {
  get(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  post(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  patch(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
  delete(
    path: string,
    handler: (
      request: { query: unknown; params: unknown; body: unknown },
      reply: FastifyReply,
    ) => unknown,
  ): unknown;
};

export function registerAgentRoutes(server: RouteServer, context: RuntimeContext): void {
  const service = createAgentService({
    db: context.database.db,
    config: context.config,
    orchestrator: context.orchestrator,
  });

  server.get("/api/agents", async (request, reply) => {
    const query = parseOrReply(listAgentsQuerySchema, request.query, reply);

    if (!query) {
      return;
    }

    return service.list(query.includeArchived);
  });

  server.get("/api/agents/catalog", async () => {
    return service.getCatalog();
  });

  server.get("/api/agents/:id", async (request, reply) => {
    const params = parseOrReply(agentIdParamsSchema, request.params, reply);

    if (!params) {
      return;
    }

    const agent = await service.get(params.id);

    if (!agent) {
      reply.code(404);
      return { error: { code: "not_found", message: "Agent not found." } };
    }

    return agent;
  });

  server.post("/api/agents", async (request, reply) => {
    const body = parseOrReply(createAgentInputSchema, request.body, reply);

    if (!body) {
      return;
    }

    reply.code(201);
    return service.create(body);
  });

  server.patch("/api/agents/:id", async (request, reply) => {
    const params = parseOrReply(agentIdParamsSchema, request.params, reply);
    const body = parseOrReply(updateAgentInputSchema, request.body, reply);

    if (!params || !body) {
      return;
    }

    const agent = await service.update(params.id, body);

    if (!agent) {
      reply.code(404);
      return { error: { code: "not_found", message: "Agent not found." } };
    }

    return agent;
  });

  server.delete("/api/agents/:id", async (request, reply) => {
    const params = parseOrReply(agentIdParamsSchema, request.params, reply);

    if (!params) {
      return;
    }

    const agent = await service.archive(params.id);

    if (!agent) {
      reply.code(404);
      return { error: { code: "not_found", message: "Agent not found." } };
    }

    return agent;
  });
}

function parseOrReply<T>(schema: z.ZodType<T>, input: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  reply.code(400);
  void reply.send({
    error: {
      code: "invalid_request",
      message: "Request validation failed.",
      details: parsed.error.flatten(),
    },
  });
  return undefined;
}
