import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  createWorkspaceSkillInputSchema,
  workspaceSkillListSchema,
  workspaceSkillMutationResultSchema,
  workspaceSkillUploadInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createAgentService } from "../services/agent-service.js";
import { createWorkspaceSkillService } from "../services/workspace-skill-service.js";

const workspaceSkillSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

export function registerWorkspaceSkillRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const workspaceSkillService = createWorkspaceSkillService({ config: context.config });
  const agentService = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });

  app.get(
    "/api/workspace-skills",
    {
      schema: {
        response: {
          200: workspaceSkillListSchema,
        },
      },
    },
    async () => workspaceSkillService.list(),
  );

  app.post(
    "/api/workspace-skills",
    {
      schema: {
        body: createWorkspaceSkillInputSchema,
        response: {
          201: workspaceSkillMutationResultSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return workspaceSkillService.create(request.body);
    },
  );

  app.post(
    "/api/workspace-skills/upload",
    {
      bodyLimit: 75 * 1024 * 1024,
      schema: {
        body: workspaceSkillUploadInputSchema,
        response: {
          201: workspaceSkillMutationResultSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return workspaceSkillService.upload(request.body);
    },
  );

  app.delete(
    "/api/workspace-skills/:slug",
    {
      schema: {
        params: workspaceSkillSlugParamsSchema,
      },
    },
    async (request, reply) => {
      await workspaceSkillService.delete(request.params.slug);

      const agents = await agentService.list(true);
      for (const agent of agents) {
        if (!agent.capabilities.workspaceSkills.includes(request.params.slug)) {
          continue;
        }

        await agentService.update(agent.id, {
          capabilities: {
            ...agent.capabilities,
            workspaceSkills: agent.capabilities.workspaceSkills.filter(
              (slug) => slug !== request.params.slug,
            ),
          },
        });
      }

      reply.code(204);
      return reply.send();
    },
  );
}
