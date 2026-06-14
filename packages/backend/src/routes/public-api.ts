import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  listPublicTasksQuerySchema,
  publicSpecialistListResponseSchema,
  publicCreateTaskBodySchema,
  publicFeedbackListResponseSchema,
  publicGetTaskQuerySchema,
  publicScheduleTaskBodySchema,
  publicTaskListResponseSchema,
  publicTaskRunListResponseSchema,
  publicTaskRunSchema,
  publicTaskRunStatusSchema,
  publicTaskSchema,
  publicTaskTemplateListResponseSchema,
  publicTriggerTaskBodySchema,
  publicTriggerTaskResponseSchema,
  publicTriggerTemplateBodySchema,
  publicTriggerTemplateResponseSchema,
} from "@cc/shared/schemas";

import { NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createSpecialistService } from "../services/specialist-service.js";
import { createConversationService } from "../services/conversation-service.js";
import { createTaskArtifactService } from "../services/task-artifact-service.js";
import { createTaskArtifactShareLinkService } from "../services/task-artifact-share-link-service.js";
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

const taskIdParamsSchema = z.object({
  id: z.string().min(1),
});

const taskRunParamsSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
});

const artifactDownloadParamsSchema = z.object({
  shareId: z.string().min(1),
});

const artifactDownloadQuerySchema = z.object({
  token: z.string().min(1),
});

function parseExpand(expand: string | undefined): Set<string> {
  return new Set(
    (expand ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function escapeHeaderFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/g, "_");
}

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
  const agentService = createSpecialistService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });
  const taskArtifactService = createTaskArtifactService({
    config: context.config,
    taskService,
  });
  const taskArtifactShareLinkService = createTaskArtifactShareLinkService({
    db: context.database.db,
    config: context.config,
    artifactService: taskArtifactService,
  });

  const service = createPublicTaskApiService({
    taskService,
    executionService,
    taskContextAttachmentService,
    agentService,
  });

  app.get(
    "/api/public/v1/task-artifacts/download/:shareId",
    {
      schema: {
        params: artifactDownloadParamsSchema,
        querystring: artifactDownloadQuerySchema,
      },
    },
    async (request, reply) => {
      const artifact = await taskArtifactShareLinkService.validateDownload({
        shareId: request.params.shareId,
        token: request.query.token,
      });

      if (!artifact.storageKey) {
        throw new NotFoundError("Task artifact share link not found.");
      }

      const path = taskArtifactService.resolveArtifactPath(artifact.storageKey);
      const details = await stat(path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new NotFoundError("Task artifact share link not found.");
        }

        throw error;
      });
      const filename = basename(artifact.originalFilename);

      reply.header("Content-Type", artifact.mimeType);
      reply.header("Content-Length", String(details.size));
      reply.header(
        "Content-Disposition",
        `attachment; filename="${escapeHeaderFilename(filename)}"`,
      );
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Cache-Control", "no-store, max-age=0");

      return reply.send(createReadStream(path));
    },
  );

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

  // --- Epic 09: direct task operations (tasks scope) -----------------------

  app.get(
    "/api/public/v1/specialists",
    {
      schema: {
        response: {
          200: publicSpecialistListResponseSchema,
        },
      },
    },
    async () => ({ specialists: await service.listAgents() }),
  );

  app.post(
    "/api/public/v1/tasks",
    {
      schema: {
        body: publicCreateTaskBodySchema,
        response: {
          201: publicTaskSchema,
        },
      },
      bodyLimit: 14 * 1024 * 1024,
    },
    async (request, reply) => {
      const task = await service.createTask(request.body);
      reply.code(201);
      return task;
    },
  );

  app.get(
    "/api/public/v1/tasks",
    {
      schema: {
        querystring: listPublicTasksQuerySchema,
        response: {
          200: publicTaskListResponseSchema,
        },
      },
    },
    async (request) => ({ tasks: await service.listTasks(request.query) }),
  );

  app.get(
    "/api/public/v1/tasks/:id",
    {
      schema: {
        params: taskIdParamsSchema,
        querystring: publicGetTaskQuerySchema,
        response: {
          200: publicTaskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.getTask(request.params.id, parseExpand(request.query.expand));

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/public/v1/tasks/:id/trigger",
    {
      schema: {
        params: taskIdParamsSchema,
        body: publicTriggerTaskBodySchema,
        response: {
          200: publicTriggerTaskResponseSchema,
        },
      },
    },
    async (request) => {
      const response = await service.triggerTask(request.params.id, request.body);

      if (!response) {
        throw new NotFoundError("Task not found.");
      }

      return response;
    },
  );

  app.post(
    "/api/public/v1/tasks/:id/schedule",
    {
      schema: {
        params: taskIdParamsSchema,
        body: publicScheduleTaskBodySchema,
        response: {
          200: publicTaskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.scheduleTask(request.params.id, request.body);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.get(
    "/api/public/v1/tasks/:id/runs",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: publicTaskRunListResponseSchema,
        },
      },
    },
    async (request) => {
      const runs = await service.listRuns(request.params.id);

      if (!runs) {
        throw new NotFoundError("Task not found.");
      }

      return { runs };
    },
  );

  app.get(
    "/api/public/v1/tasks/:id/runs/:runId",
    {
      schema: {
        params: taskRunParamsSchema,
        response: {
          200: publicTaskRunSchema,
        },
      },
    },
    async (request) => {
      const run = await service.getRun(request.params.id, request.params.runId);

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      return run;
    },
  );

  app.get(
    "/api/public/v1/tasks/:id/feedback",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: publicFeedbackListResponseSchema,
        },
      },
    },
    async (request) => {
      const feedback = await service.listFeedback(request.params.id);

      if (!feedback) {
        throw new NotFoundError("Task not found.");
      }

      return { feedback };
    },
  );
}
