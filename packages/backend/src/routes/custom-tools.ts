import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  copyCustomToolToAgentsInputSchema,
  createCustomToolInputSchema,
  customToolBulkCopyResultSchema,
  customToolListSchema,
  customToolMutationResultSchema,
  customToolSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createAgentService } from "../services/agent-service.js";
import { createCustomToolService } from "../services/custom-tool-service.js";

const customToolSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

export function registerCustomToolRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const customToolService = createCustomToolService({
    config: context.config,
    db: context.database.db,
    opencodeService: context.opencodeService,
    listAgents: async () => {
      const agents = await agentService.list();
      return agents.map((agent) => ({
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        workspacePath: agent.workspacePath,
      }));
    },
  });
  const agentService = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    customToolService,
  });

  app.get(
    "/api/custom-tools",
    {
      schema: {
        response: {
          200: customToolListSchema,
        },
      },
    },
    async () => customToolService.listGlobal(),
  );

  app.get(
    "/api/custom-tools/:slug",
    {
      schema: {
        params: customToolSlugParamsSchema,
        response: {
          200: customToolSchema,
        },
      },
    },
    async (request) => customToolService.getGlobal(request.params.slug),
  );

  app.post(
    "/api/custom-tools",
    {
      schema: {
        body: createCustomToolInputSchema,
        response: {
          201: customToolMutationResultSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return customToolService.create(request.body);
    },
  );

  app.delete(
    "/api/custom-tools/:slug",
    {
      schema: {
        params: customToolSlugParamsSchema,
      },
    },
    async (request, reply) => {
      await customToolService.deleteGlobal(request.params.slug);
      reply.code(204);
      return reply.send();
    },
  );

  app.post(
    "/api/custom-tools/:slug/copy-to-agents",
    {
      schema: {
        params: customToolSlugParamsSchema,
        body: copyCustomToolToAgentsInputSchema,
        response: {
          200: customToolBulkCopyResultSchema,
        },
      },
    },
    async (request) => {
      const tool = await customToolService.getGlobal(request.params.slug);
      const destinationName = request.body.destinationName?.trim();
      const destinationSlug = destinationName ? slugify(destinationName) : tool.slug;

      if (destinationSlug !== tool.slug) {
        return customToolService.copyGlobalToAgents({
          slug: request.params.slug,
          agentIds: request.body.agentIds,
          destinationName,
          overwrite: request.body.overwrite,
        });
      }

      const copied: Array<{ agentId: string; agentSlug: string; overwritten: boolean }> = [];

      for (const agentId of request.body.agentIds) {
        const agent = await agentService.get(agentId);

        if (!agent) {
          throw new NotFoundError("Agent not found.");
        }

        const nextCustomTools = agent.capabilities.customTools.includes(tool.slug)
          ? agent.capabilities.customTools
          : [...agent.capabilities.customTools, tool.slug];

        const updated = await agentService.update(agent.id, {
          capabilities: {
            ...agent.capabilities,
            customTools: nextCustomTools,
          },
          customToolOverwriteSlugs: request.body.overwrite ? [tool.slug] : [],
        });

        if (!updated) {
          throw new NotFoundError("Agent not found.");
        }

        copied.push({
          agentId: updated.id,
          agentSlug: updated.slug,
          overwritten: request.body.overwrite,
        });
      }

      return { copied, warnings: tool.warnings };
    },
  );
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}
