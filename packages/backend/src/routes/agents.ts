import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  opencodeFileContentQuerySchema,
  opencodeFileContentSchema,
  opencodeFileListQuerySchema,
  opencodeFileListResultSchema,
  opencodeFileSearchQuerySchema,
  opencodeFileSearchResultSchema,
  opencodeFileStatusResultSchema,
  opencodeTextSearchQuerySchema,
  opencodeTextSearchResultSchema,
} from "@cc/shared/schemas";

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

export function registerAgentRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });

  async function requireAgent(id: string) {
    const agent = await service.get(id);

    if (!agent) {
      throw new NotFoundError("Agent not found.");
    }

    return agent;
  }

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
    "/api/agents/:id/workspace/find",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeTextSearchQuerySchema,
        response: {
          200: opencodeTextSearchResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.findText(agent.workspacePath, request.query.pattern);
    },
  );

  app.get(
    "/api/agents/:id/workspace/find/file",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileSearchQuerySchema,
        response: {
          200: opencodeFileSearchResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.findFiles(agent.workspacePath, request.query);
    },
  );

  app.get(
    "/api/agents/:id/workspace/file",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileListQuerySchema,
        response: {
          200: opencodeFileListResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.listFiles(agent.workspacePath, request.query.path);
    },
  );

  app.get(
    "/api/agents/:id/workspace/file/content",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileContentQuerySchema,
        response: {
          200: opencodeFileContentSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.readFile(agent.workspacePath, request.query.path);
    },
  );

  app.get(
    "/api/agents/:id/workspace/file/status",
    {
      schema: {
        params: agentIdParamsSchema,
        response: {
          200: opencodeFileStatusResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.getFileStatus(agent.workspacePath);
    },
  );
}
