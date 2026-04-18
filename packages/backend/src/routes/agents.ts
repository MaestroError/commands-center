import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { createAgentInputSchema, updateAgentInputSchema } from "../schemas/agents.js";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createAgentService } from "../services/agent-service.js";

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const agentSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

const listAgentsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
});

const workspaceFilesQuerySchema = z.object({
  query: z.string().default(""),
});

const workspaceTreeQuerySchema = z.object({
  path: z.string().optional(),
});

export function registerAgentRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });

  app.get(
    "/api/agents",
    {
      schema: {
        querystring: listAgentsQuerySchema,
      },
    },
    async (request) => service.list(request.query.includeArchived),
  );

  app.get("/api/agents/catalog", async () => service.getCatalog());

  app.get(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.get(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/agents/by-slug/:slug",
    {
      schema: {
        params: agentSlugParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.getBySlug(request.params.slug);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.post(
    "/api/agents",
    {
      schema: {
        body: createAgentInputSchema,
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.create(request.body);
    },
  );

  app.patch(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
        body: updateAgentInputSchema,
      },
    },
    async (request) => {
      const agent = await service.update(request.params.id, request.body);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.delete(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.archive(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/agents/:id/workspace/files",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: workspaceFilesQuerySchema,
      },
    },
    async (request) => {
      const agent = await service.get(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      const files = await context.opencodeService.searchWorkspaceFiles(
        agent.workspacePath,
        request.query.query,
      );

      return { files };
    },
  );

  app.get(
    "/api/agents/:id/workspace/tree",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: workspaceTreeQuerySchema,
      },
    },
    async (request) => {
      const agent = await service.get(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      const nodes = await context.opencodeService.listWorkspaceTree(
        agent.workspacePath,
        request.query.path,
      );

      return { nodes };
    },
  );
}
