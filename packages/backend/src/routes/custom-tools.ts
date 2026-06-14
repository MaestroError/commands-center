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
import { ConflictError } from "../lib/api-error.js";
import { createSpecialistService } from "../services/specialist-service.js";
import { createCustomToolActionService } from "../services/custom-tool-action-service.js";
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
  const agentService = createSpecialistService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    customToolService,
  });
  const customToolActionService = createCustomToolActionService({
    customToolService,
    agentService,
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
      const result = await customToolActionService.copyGlobalToolToAgents({
        slug: request.params.slug,
        agentIds: request.body.agentIds,
        destinationName: request.body.destinationName,
        overwrite: request.body.overwrite,
      });

      if (result.status === "conflict") {
        throw new ConflictError(result.conflict.message);
      }

      return result.result;
    },
  );
}
