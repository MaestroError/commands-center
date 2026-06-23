import {
  systemPromptBodySchema,
  systemPromptDetailSchema,
  systemPromptListResponseSchema,
  type SystemPromptDefinitionMeta,
  type SystemPromptDetail,
} from "@cc/shared/schemas";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import {
  createSystemPromptService,
  type SystemPromptService,
} from "../system-prompts/system-prompt-service.js";
import type { SystemPromptDefinition } from "../system-prompts/types.js";
import { listVariables } from "../system-prompts/variables.js";

const idParamsSchema = z.object({ id: z.string().min(1) });

function toMeta(definition: SystemPromptDefinition): SystemPromptDefinitionMeta {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    scope: definition.scope,
    order: definition.order,
    optional: definition.optional,
    danger: definition.danger,
    enabledByDefault: definition.enabledByDefault,
    variables: definition.variables,
  };
}

async function buildDetail(
  service: SystemPromptService,
  definition: SystemPromptDefinition,
): Promise<SystemPromptDetail> {
  const { body, isCustomized } = await service.getBody(definition.id);
  return {
    definition: toMeta(definition),
    body,
    defaultBody: definition.defaultBody,
    isCustomized,
  };
}

export function registerSystemPromptRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service =
    context.systemPromptService ??
    createSystemPromptService({ config: context.config, logger: context.logger });

  app.get(
    "/api/system-prompts",
    { schema: { response: { 200: systemPromptListResponseSchema } } },
    async () => {
      const prompts = await Promise.all(
        service.listDefinitions().map(async (definition) => ({
          ...toMeta(definition),
          isCustomized: await service.isCustomized(definition.id),
        })),
      );
      return { prompts, variables: listVariables() };
    },
  );

  app.get(
    "/api/system-prompts/:id",
    { schema: { params: idParamsSchema, response: { 200: systemPromptDetailSchema } } },
    async (request) => {
      const definition = requireDefinition(service, request.params.id);
      return buildDetail(service, definition);
    },
  );

  app.put(
    "/api/system-prompts/:id",
    {
      schema: {
        params: idParamsSchema,
        body: systemPromptBodySchema,
        response: { 200: systemPromptDetailSchema },
      },
    },
    async (request) => {
      const definition = requireDefinition(service, request.params.id);
      await service.saveBody(definition.id, request.body.body);
      return buildDetail(service, definition);
    },
  );

  app.delete(
    "/api/system-prompts/:id",
    { schema: { params: idParamsSchema, response: { 200: systemPromptDetailSchema } } },
    async (request) => {
      const definition = requireDefinition(service, request.params.id);
      await service.resetBody(definition.id);
      return buildDetail(service, definition);
    },
  );
}

function requireDefinition(service: SystemPromptService, id: string): SystemPromptDefinition {
  const definition = service.listDefinitions().find((entry) => entry.id === id);
  if (!definition) {
    throw new NotFoundError(`Unknown system prompt: ${id}`);
  }
  return definition;
}
