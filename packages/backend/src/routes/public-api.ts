import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  listPublicTasksQuerySchema,
  publicSpecialistListResponseSchema,
  createDocumentPathSchema,
  publicCreateTaskBodySchema,
  publicDocumentCreateResponseSchema,
  publicDocumentListResponseSchema,
  publicDocumentReadSchema,
  publicDocumentSearchResponseSchema,
  publicFeedbackListResponseSchema,
  publicGetTaskQuerySchema,
  publicScheduleTaskBodySchema,
  publicTaskListResponseSchema,
  publicTaskRunListResponseSchema,
  publicTaskRunSchema,
  publicTaskRunStatusSchema,
  publicTaskSchema,
  publicTaskTemplateListResponseSchema,
  publicTaskTemplateStatusSchema,
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
import { createArtifactService } from "../services/artifact-service.js";
import { createArtifactDeliveryService } from "../services/artifact-delivery-service.js";
import { createArtifactShareLinkService } from "../services/artifact-share-link-service.js";
import { createPublicTaskApiService } from "../services/public-task-api-service.js";
import { createDocumentService } from "../services/document-service.js";
import { createPublicDocumentApiService } from "../services/public-document-api-service.js";
import { createTaskContextAttachmentService } from "../services/task-context-attachment-service.js";
import { createTaskExecutionService } from "../services/task-execution-service.js";
import { createTaskService } from "../services/task-service.js";
import { buildArtifactDeliveryContext } from "./public-artifacts.js";

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

const publicDocumentListQuerySchema = z.object({
  scope: z.enum(["global", "private"]).optional(),
  owner: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const publicDocumentSearchQuerySchema = publicDocumentListQuerySchema.extend({
  query: z.string().trim().min(1),
  includeContent: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  maxSnippetsPerDocument: z.coerce.number().int().min(1).max(10).default(3),
});

const publicDocumentReadQuerySchema = z
  .object({
    scope: z.enum(["global", "private"]),
    owner: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1),
  })
  .superRefine((input, context) => {
    if (input.scope === "private" && !input.owner) {
      context.addIssue({ code: "custom", path: ["owner"], message: "Private owner is required" });
    }
    if (input.scope === "global" && input.owner) {
      context.addIssue({ code: "custom", path: ["owner"], message: "Global owner is forbidden" });
    }
  });

const publicDocumentCreateBodySchema = z
  .object({
    scope: z.enum(["global", "private"]),
    owner: z.string().trim().min(1).optional(),
    path: createDocumentPathSchema,
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    author: z.string().trim().min(1).optional(),
    content: z.string().optional(),
  })
  .superRefine((input, context) => {
    if (input.scope === "private" && !input.owner) {
      context.addIssue({ code: "custom", path: ["owner"], message: "Private owner is required" });
    }
    if (input.scope === "global" && input.owner) {
      context.addIssue({ code: "custom", path: ["owner"], message: "Global owner is forbidden" });
    }
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
    logger: context.logger,
    archiveService: context.sessionArchiveService,
    archiveSettingsService: context.sessionArchiveSettingsService,
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
      orchestrator: context.orchestrator,
      taskContextAttachmentService,
      logger: context.logger,
      archiveService: context.sessionArchiveService,
      archiveSettingsService: context.sessionArchiveSettingsService,
    });
  const agentService = createSpecialistService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });
  const artifactService = createArtifactService({
    db: context.database.db,
    config: context.config,
  });
  const artifactShareLinkService = createArtifactShareLinkService({
    db: context.database.db,
    config: context.config,
    artifactService,
  });
  const deliveryService = createArtifactDeliveryService({
    artifactService,
    config: context.config,
    logger: context.logger,
  });

  const service = createPublicTaskApiService({
    taskService,
    executionService,
    taskContextAttachmentService,
    agentService,
    artifactDelivery: {
      deliveryService,
      resolveDeliveryContext: (run) =>
        buildArtifactDeliveryContext({
          run,
          taskService,
          artifactShareLinkService,
          config: context.config,
        }),
    },
  });
  const documentService = createPublicDocumentApiService({
    db: context.database.db,
    documentService: createDocumentService({
      db: context.database.db,
      config: context.config,
      logger: context.logger,
    }),
  });

  app.get(
    "/api/public/v1/documents",
    {
      schema: {
        querystring: publicDocumentListQuerySchema,
        response: { 200: publicDocumentListResponseSchema },
      },
    },
    async (request) =>
      documentService.listDocuments(request.apiToken!, {
        scope: request.query.scope,
        ownerSlug: request.query.owner,
        query: request.query.query,
        limit: request.query.limit,
        offset: request.query.offset,
      }),
  );

  app.get(
    "/api/public/v1/documents/search",
    {
      schema: {
        querystring: publicDocumentSearchQuerySchema,
        response: { 200: publicDocumentSearchResponseSchema },
      },
    },
    async (request) =>
      documentService.searchDocuments(request.apiToken!, {
        query: request.query.query,
        scope: request.query.scope,
        ownerSlug: request.query.owner,
        includeContent: request.query.includeContent,
        limit: request.query.limit,
        offset: request.query.offset,
        maxSnippetsPerDocument: request.query.maxSnippetsPerDocument,
      }),
  );

  app.get(
    "/api/public/v1/documents/read",
    {
      schema: {
        querystring: publicDocumentReadQuerySchema,
        response: { 200: publicDocumentReadSchema },
      },
    },
    async (request) =>
      documentService.readDocument(request.apiToken!, {
        scope: request.query.scope,
        ownerSlug: request.query.owner,
        path: request.query.path,
      }),
  );

  app.post(
    "/api/public/v1/documents",
    {
      schema: {
        body: publicDocumentCreateBodySchema,
        response: { 200: publicDocumentCreateResponseSchema },
      },
    },
    async (request) =>
      documentService.createDocument(request.apiToken!, {
        scope: request.body.scope,
        ownerSlug: request.body.owner,
        path: request.body.path,
        title: request.body.title,
        description: request.body.description,
        author: request.body.author,
        content: request.body.content,
      }),
  );

  app.get(
    "/api/public/v1/task-artifacts/download/:shareId",
    {
      schema: {
        params: artifactDownloadParamsSchema,
        querystring: artifactDownloadQuerySchema,
      },
    },
    async (request, reply) => {
      const artifact = await artifactShareLinkService.validateDownload({
        shareId: request.params.shareId,
        token: request.query.token,
      });

      if (!artifact.storageKey) {
        throw new NotFoundError("Task artifact share link not found.");
      }

      const path = artifactService.resolveArtifactPath(artifact.storageKey);
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

  // Template Active-status management. Gated by the broader `tasks` scope
  // rather than the trigger-only `templates` scope.
  app.post(
    "/api/public/v1/task-templates/:id/enable",
    {
      schema: {
        params: templateIdParamsSchema,
        response: {
          200: publicTaskTemplateStatusSchema,
        },
      },
    },
    async (request) => {
      const template = await service.setTemplateEnabled(request.params.id, true);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

  app.post(
    "/api/public/v1/task-templates/:id/disable",
    {
      schema: {
        params: templateIdParamsSchema,
        response: {
          200: publicTaskTemplateStatusSchema,
        },
      },
    },
    async (request) => {
      const template = await service.setTemplateEnabled(request.params.id, false);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

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
