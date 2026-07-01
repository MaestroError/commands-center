import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  activeTaskRunListSchema,
  cancelTaskRunInputSchema,
  createTaskArtifactShareLinkInputSchema,
  createTaskArtifactShareLinkResponseSchema,
  createTaskRunFollowupInputSchema,
  createTaskTemplateInputSchema,
  createTaskInputSchema,
  createTaskFeedbackInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  queueTaskInputSchema,
  revokeTaskArtifactShareLinkResponseSchema,
  taskQueuePreviewInputSchema,
  taskQueuePreviewSchema,
  taskArtifactListResponseSchema,
  taskArtifactSharingPreferencesSchema,
  taskFeedbackThreadListSchema,
  taskFeedbackThreadSchema,
  taskListSchema,
  taskRunFollowupSchema,
  taskRunListSchema,
  taskRunSchema,
  taskRunSessionInspectionSchema,
  taskSchedulerStateListSchema,
  taskSchema,
  taskSubtaskInputSchema,
  taskSubtaskListSchema,
  taskSubtaskProgressListSchema,
  taskSubtaskSchema,
  taskTemplateListSchema,
  taskTemplateRunNowInputSchema,
  taskTemplateSchema,
  updateTaskArtifactSharingPreferencesInputSchema,
  updateTaskContextInputSchema,
  updateTaskFeedbackInputSchema,
  updateTaskInputSchema,
  updateTaskTemplateInputSchema,
  updateTaskSubtaskInputSchema,
  uploadTaskContextAttachmentInputSchema,
  uploadTaskContextAttachmentResponseSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createConversationService } from "../services/conversation-service.js";
import { createTaskExecutionService } from "../services/task-execution-service.js";
import { createTaskContextAttachmentService } from "../services/task-context-attachment-service.js";
import { createTaskSchedulerService } from "../services/task-scheduler-service.js";
import { createTaskArtifactService } from "../services/task-artifact-service.js";
import { createTaskArtifactShareLinkService } from "../services/task-artifact-share-link-service.js";
import { createTaskService } from "../services/task-service.js";
import { triggerTemplateRun } from "../services/trigger-template-run.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1),
});

const taskRunParamsSchema = taskIdParamsSchema.extend({
  runId: z.string().min(1),
});

const taskRunArtifactParamsSchema = taskRunParamsSchema.extend({
  artifactId: z.string().min(1),
});

const taskRunArtifactShareLinkParamsSchema = taskRunArtifactParamsSchema.extend({
  shareId: z.string().min(1),
});

const taskSubtaskParamsSchema = taskIdParamsSchema.extend({
  subtaskId: z.string().min(1),
});

const taskFeedbackParamsSchema = taskIdParamsSchema.extend({
  feedbackId: z.string().min(1),
});

export function registerTaskRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createTaskService({
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
    taskService: service,
  });
  const fallbackTaskSchedulerServiceRef: {
    current?: ReturnType<typeof createTaskSchedulerService>;
  } = {};
  const executionService =
    context.taskExecutionService ??
    createTaskExecutionService({
      db: context.database.db,
      taskService: service,
      conversationService,
      orchestrator: context.orchestrator,
      taskContextAttachmentService,
      logger: context.logger,
      archiveService: context.sessionArchiveService,
      archiveSettingsService: context.sessionArchiveSettingsService,
      onRunTerminal: (run) => fallbackTaskSchedulerServiceRef.current?.handleRunTerminal(run),
    });
  const taskSchedulerService =
    context.taskSchedulerService ??
    createTaskSchedulerService({
      db: context.database.db,
      taskService: service,
      executionService,
      logger: context.logger,
    });
  fallbackTaskSchedulerServiceRef.current = taskSchedulerService;
  const taskArtifactService = createTaskArtifactService({
    config: context.config,
    taskService: service,
  });
  const taskArtifactShareLinkService = createTaskArtifactShareLinkService({
    db: context.database.db,
    config: context.config,
    artifactService: taskArtifactService,
  });

  app.get(
    "/api/tasks/runs/active",
    {
      schema: {
        response: {
          200: activeTaskRunListSchema,
        },
      },
    },
    async () => executionService.listActiveRuns(),
  );

  app.get(
    "/api/tasks/scheduler/state",
    {
      schema: {
        response: {
          200: taskSchedulerStateListSchema,
        },
      },
    },
    async () => taskSchedulerService.listStates(),
  );

  app.post(
    "/api/tasks/scheduler/tick",
    {
      schema: {
        response: {
          200: taskSchedulerStateListSchema,
        },
      },
    },
    async () => taskSchedulerService.tick(),
  );

  app.get(
    "/api/tasks/artifact-sharing/preferences",
    {
      schema: {
        response: {
          200: taskArtifactSharingPreferencesSchema,
        },
      },
    },
    async () => taskArtifactShareLinkService.getPreferences(),
  );

  app.put(
    "/api/tasks/artifact-sharing/preferences",
    {
      schema: {
        body: updateTaskArtifactSharingPreferencesInputSchema,
        response: {
          200: taskArtifactSharingPreferencesSchema,
        },
      },
    },
    async (request) => taskArtifactShareLinkService.setPreferences(request.body),
  );

  app.get(
    "/api/tasks",
    {
      schema: {
        querystring: listTasksQuerySchema,
        response: {
          200: taskListSchema,
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    "/api/tasks/archive",
    {
      schema: {
        response: {
          200: taskListSchema,
        },
      },
    },
    async () => service.listArchived(),
  );

  app.get(
    "/api/tasks/templates",
    {
      schema: {
        response: {
          200: taskTemplateListSchema,
        },
      },
    },
    async () => service.listTemplates(),
  );

  app.post(
    "/api/tasks/templates",
    {
      schema: {
        body: createTaskTemplateInputSchema,
        response: {
          201: taskTemplateSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.createTemplate(request.body);
    },
  );

  app.get(
    "/api/tasks/templates/:id",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskTemplateSchema,
        },
      },
    },
    async (request) => {
      const template = await service.getTemplate(request.params.id);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

  app.patch(
    "/api/tasks/templates/:id",
    {
      schema: {
        params: taskIdParamsSchema,
        body: updateTaskTemplateInputSchema,
        response: {
          200: taskTemplateSchema,
        },
      },
    },
    async (request) => {
      const template = await service.updateTemplate(request.params.id, request.body);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

  app.post(
    "/api/tasks/templates/:id/enable",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskTemplateSchema,
        },
      },
    },
    async (request) => {
      const template = await service.enableTemplate(request.params.id);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

  app.post(
    "/api/tasks/templates/:id/disable",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskTemplateSchema,
        },
      },
    },
    async (request) => {
      const template = await service.disableTemplate(request.params.id);

      if (!template) {
        throw new NotFoundError("Task template not found.");
      }

      return template;
    },
  );

  app.get(
    "/api/tasks/templates/:id/tasks",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskListSchema,
        },
      },
    },
    async (request) => service.listTemplateTasks(request.params.id),
  );

  app.post(
    "/api/tasks/templates/:id/tasks",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          201: taskSchema,
        },
      },
    },
    async (request, reply) => {
      const task = await service.createTaskFromTemplate(request.params.id, {
        triggerSource: "manual",
        allowDisabled: true,
      });

      if (!task) {
        throw new NotFoundError("Task template not found.");
      }

      reply.code(201);
      return task;
    },
  );

  app.post(
    "/api/tasks/templates/:id/run-now",
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskTemplateRunNowInputSchema,
        response: {
          200: taskRunSchema,
        },
      },
    },
    async (request) => {
      const result = await triggerTemplateRun(
        { taskService: service, executionService, taskContextAttachmentService },
        {
          templateId: request.params.id,
          triggerSource: "manual",
          context: request.body.context,
          contextAttachmentUploads: request.body.contextAttachmentUploads,
          metadata: request.body.metadata,
          allowDisabled: true,
        },
      );

      // run-now never schedules (no `scheduledFor`), so the result is always
      // queued unless the template is missing.
      if (result.kind !== "queued") {
        throw new NotFoundError("Task template not found.");
      }

      return result.run;
    },
  );

  app.post(
    "/api/tasks",
    {
      schema: {
        body: createTaskInputSchema,
        response: {
          201: taskSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.create(request.body);
    },
  );

  app.get(
    "/api/tasks/:id",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.get(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.patch(
    "/api/tasks/:id",
    {
      schema: {
        params: taskIdParamsSchema,
        body: updateTaskInputSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.update(request.params.id, request.body);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/tasks/:id/context/attachments",
    {
      schema: {
        params: taskIdParamsSchema,
        body: uploadTaskContextAttachmentInputSchema,
        response: {
          201: uploadTaskContextAttachmentResponseSchema,
        },
      },
      bodyLimit: 14 * 1024 * 1024,
    },
    async (request, reply) => {
      reply.code(201);
      return taskContextAttachmentService.upload(request.params.id, request.body);
    },
  );

  app.patch(
    "/api/tasks/:id/context",
    {
      schema: {
        params: taskIdParamsSchema,
        body: updateTaskContextInputSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.updateContext(request.params.id, request.body);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/tasks/:id/duplicate",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          201: taskSchema,
        },
      },
    },
    async (request, reply) => {
      const task = await service.duplicate(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      reply.code(201);
      return task;
    },
  );

  app.post(
    "/api/tasks/:id/archive",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.archive(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/tasks/:id/accept",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.acceptTask(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/tasks/:id/restore",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.restore(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.get(
    "/api/tasks/:id/feedback",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskFeedbackThreadListSchema,
        },
      },
    },
    async (request) => service.listFeedback(request.params.id),
  );

  app.post(
    "/api/tasks/:id/feedback",
    {
      schema: {
        params: taskIdParamsSchema,
        body: createTaskFeedbackInputSchema,
        response: {
          201: taskFeedbackThreadSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.createFeedback(request.params.id, request.body);
    },
  );

  app.patch(
    "/api/tasks/:id/feedback/:feedbackId",
    {
      schema: {
        params: taskFeedbackParamsSchema,
        body: updateTaskFeedbackInputSchema,
        response: {
          200: taskFeedbackThreadSchema,
        },
      },
    },
    async (request) => {
      const feedback = await service.updateFeedback(
        request.params.id,
        request.params.feedbackId,
        request.body,
      );

      if (!feedback) {
        throw new NotFoundError("Task feedback not found.");
      }

      return feedback;
    },
  );

  app.get(
    "/api/tasks/:id/subtasks",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSubtaskListSchema,
        },
      },
    },
    async (request) => service.listSubtasks(request.params.id),
  );

  app.post(
    "/api/tasks/:id/subtasks",
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskSubtaskInputSchema,
        response: {
          201: taskSubtaskSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.createSubtask(request.params.id, request.body);
    },
  );

  app.patch(
    "/api/tasks/:id/subtasks/:subtaskId",
    {
      schema: {
        params: taskSubtaskParamsSchema,
        body: updateTaskSubtaskInputSchema,
        response: {
          200: taskSubtaskSchema,
        },
      },
    },
    async (request) => {
      const subtask = await service.updateSubtask(
        request.params.id,
        request.params.subtaskId,
        request.body,
      );

      if (!subtask) {
        throw new NotFoundError("Task subtask not found.");
      }

      return subtask;
    },
  );

  app.post(
    "/api/tasks/:id/enable",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.enable(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.post(
    "/api/tasks/:id/disable",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskSchema,
        },
      },
    },
    async (request) => {
      const task = await service.disable(request.params.id);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      return task;
    },
  );

  app.delete(
    "/api/tasks/:id",
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request, reply) => {
      const task = await service.get(request.params.id, { includeArchived: true });
      const deleted = await service.delete(request.params.id);

      if (!deleted) {
        throw new NotFoundError("Task not found.");
      }

      if (task && task.templateId !== task.id) {
        await taskContextAttachmentService.removeForTask(task);
      }

      reply.code(204);
    },
  );

  app.get(
    "/api/tasks/subtask-progress",
    {
      schema: {
        querystring: z.object({ taskIds: z.string().optional().default("") }),
        response: {
          200: taskSubtaskProgressListSchema,
        },
      },
    },
    async (request) =>
      service.listSubtaskProgress(
        request.query.taskIds
          .split(",")
          .map((taskId) => taskId.trim())
          .filter(Boolean),
      ),
  );

  app.get(
    "/api/tasks/:id/runs",
    {
      schema: {
        params: taskIdParamsSchema,
        querystring: listTaskRunsQuerySchema,
        response: {
          200: taskRunListSchema,
        },
      },
    },
    async (request) => service.listRuns(request.params.id, request.query),
  );

  app.post(
    "/api/tasks/:id/queue/preview",
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskQueuePreviewInputSchema,
        response: {
          200: taskQueuePreviewSchema,
        },
      },
    },
    async (request) => executionService.preview(request.params.id, request.body),
  );

  app.post(
    "/api/tasks/:id/queue",
    {
      schema: {
        params: taskIdParamsSchema,
        body: queueTaskInputSchema.omit({ taskId: true }),
        response: {
          200: taskRunSchema,
        },
      },
    },
    async (request) => executionService.queue(request.params.id, request.body),
  );

  app.get(
    "/api/tasks/:id/runs/:runId",
    {
      schema: {
        params: taskRunParamsSchema,
        response: {
          200: taskRunSchema,
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
    "/api/tasks/:id/runs/:runId/followups",
    {
      schema: {
        params: taskRunParamsSchema,
        response: {
          200: z.array(taskRunFollowupSchema),
        },
      },
    },
    async (request) => {
      const run = await service.getRun(request.params.id, request.params.runId);

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      return service.listFollowups(request.params.runId);
    },
  );

  app.post(
    "/api/tasks/:id/runs/:runId/followups",
    {
      schema: {
        params: taskRunParamsSchema,
        body: createTaskRunFollowupInputSchema,
        response: {
          201: taskRunFollowupSchema,
        },
      },
    },
    async (request, reply) => {
      const run = await service.getRun(request.params.id, request.params.runId);

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      const followup = await executionService.sendRunReply(request.params.runId, request.body);

      reply.code(201);
      return followup;
    },
  );

  app.get(
    "/api/tasks/:id/runs/:runId/artifacts",
    {
      schema: {
        params: taskRunParamsSchema,
        response: {
          200: taskArtifactListResponseSchema,
        },
      },
    },
    async (request) => {
      const [artifacts, shareLinks] = await Promise.all([
        taskArtifactService.listRunArtifacts(request.params.id, request.params.runId),
        taskArtifactShareLinkService.listForRun(request.params.id, request.params.runId),
      ]);

      return {
        artifacts: artifacts.map((artifact) => ({
          ...artifact,
          shareLinks: shareLinks.filter(
            (link) => link.artifactId === artifact.id && link.revokedAt === null,
          ),
        })),
      };
    },
  );

  app.post(
    "/api/tasks/:id/runs/:runId/artifacts/:artifactId/share-links",
    {
      schema: {
        params: taskRunArtifactParamsSchema,
        body: createTaskArtifactShareLinkInputSchema,
        response: {
          200: createTaskArtifactShareLinkResponseSchema,
        },
      },
    },
    async (request) => {
      const artifact = await taskArtifactService.publishRunArtifact(
        request.params.id,
        request.params.runId,
        request.params.artifactId,
      );

      return taskArtifactShareLinkService.createLink({
        artifact,
        body: request.body,
        baseUrl: getRequestBaseUrl(context, request),
      });
    },
  );

  app.delete(
    "/api/tasks/:id/runs/:runId/artifacts/:artifactId/share-links/:shareId",
    {
      schema: {
        params: taskRunArtifactShareLinkParamsSchema,
        response: {
          200: revokeTaskArtifactShareLinkResponseSchema,
        },
      },
    },
    async (request) => {
      await taskArtifactShareLinkService.revokeLink({
        taskId: request.params.id,
        runId: request.params.runId,
        artifactId: request.params.artifactId,
        shareId: request.params.shareId,
      });

      return { revoked: true as const };
    },
  );

  app.get(
    "/api/tasks/:id/runs/:runId/session",
    {
      schema: {
        params: taskRunParamsSchema,
        response: {
          200: taskRunSessionInspectionSchema,
        },
      },
    },
    async (request) => {
      const run = await service.getRun(request.params.id, request.params.runId);

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      const inspection = await conversationService.inspectTaskRunConversation(
        request.params.id,
        request.params.runId,
      );

      return taskRunSessionInspectionSchema.parse({
        run,
        ...inspection,
      });
    },
  );

  app.post(
    "/api/tasks/:id/runs/:runId/open-in-chat",
    {
      schema: {
        params: taskRunParamsSchema,
      },
    },
    async (request) =>
      conversationService.openTaskRunConversationInChat(request.params.id, request.params.runId),
  );

  app.post(
    "/api/tasks/:id/runs/:runId/cancel",
    {
      schema: {
        params: taskRunParamsSchema,
        body: cancelTaskRunInputSchema,
        response: {
          200: taskRunSchema,
        },
      },
    },
    async (request) => executionService.cancel(request.params.runId, request.body),
  );
}

function getRequestBaseUrl(context: RuntimeContext, request: { headers: Record<string, unknown> }) {
  if (context.config.security.publicOrigin) {
    return context.config.security.publicOrigin;
  }

  const host = typeof request.headers["host"] === "string" ? request.headers["host"] : "localhost";
  const forwardedProto =
    typeof request.headers["x-forwarded-proto"] === "string"
      ? request.headers["x-forwarded-proto"]
      : "http";
  const proto = forwardedProto.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}
