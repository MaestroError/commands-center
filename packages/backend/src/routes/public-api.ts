import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  publicTaskRunStatusSchema,
  publicTaskTemplateListResponseSchema,
  publicTriggerTemplateBodySchema,
  publicTriggerTemplateResponseSchema,
} from "@cc/shared/schemas";

import { NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createConversationService } from "../services/conversation-service.js";
import { createPublicTaskApiService } from "../services/public-task-api-service.js";
import { createTaskContextAttachmentService } from "../services/task-context-attachment-service.js";
import { createTaskExecutionService } from "../services/task-execution-service.js";
import { createTaskService } from "../services/task-service.js";

const templateIdParamsSchema = z.object({
  id: z.string().min(1),
});

const runIdParamsSchema = z.object({
  runId: z.string().min(1),
});

/**
 * Public, bearer-authenticated API under `/api/public/v1/`.
 *
 * Authentication, `request.apiToken` attachment, and per-route scope
 * enforcement all live in the owner-auth guard's `/api/public/` branch
 * (Epic 07 Story 4). These handlers do not re-check auth — by the time they
 * run, the token has already been validated and scoped. The scope table in
 * `owner-auth-guard.ts` (`scopeForPublicRoute`) maps:
 *   - `GET  /api/public/v1/task-templates`        → templates OR tasks
 *   - `POST /api/public/v1/task-templates/:id/trigger` → templates
 *   - `GET  /api/public/v1/task-runs/:runId`      → templates
 */
export function registerPublicApiRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();

  const taskService = createTaskService({
    db: context.database.db,
    config: context.config,
  });
  const conversationService = createConversationService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: context.config,
    taskService,
  });
  const executionService =
    context.taskExecutionService ??
    createTaskExecutionService({
      db: context.database.db,
      taskService,
      conversationService,
      taskContextAttachmentService,
      logger: context.logger,
    });

  const service = createPublicTaskApiService({
    taskService,
    executionService,
    taskContextAttachmentService,
  });

  app.get(
    "/api/public/v1/task-templates",
    {
      schema: {
        response: {
          200: publicTaskTemplateListResponseSchema,
        },
      },
    },
    async () => ({ templates: await service.listTriggerableTemplates() }),
  );

  app.post(
    "/api/public/v1/task-templates/:id/trigger",
    {
      schema: {
        params: templateIdParamsSchema,
        body: publicTriggerTemplateBodySchema,
        response: {
          200: publicTriggerTemplateResponseSchema,
        },
      },
      // Matches the internal upload route, leaving base64 headroom over the
      // 10 MB per-attachment file cap.
      bodyLimit: 14 * 1024 * 1024,
    },
    async (request) => {
      const outcome = await service.triggerTemplate(request.params.id, request.body);

      if (outcome.kind === "not_found") {
        throw new NotFoundError("Task template not found.");
      }

      return outcome.response;
    },
  );

  app.get(
    "/api/public/v1/task-runs/:runId",
    {
      schema: {
        params: runIdParamsSchema,
        response: {
          200: publicTaskRunStatusSchema,
        },
      },
    },
    async (request) => {
      const run = await service.getRunStatus(request.params.runId);

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      return run;
    },
  );
}
