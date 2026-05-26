import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  activeTaskRunListSchema,
  cancelTaskRunInputSchema,
  createTaskTemplateInputSchema,
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  queueTaskInputSchema,
  taskCommentInputSchema,
  taskCommentListSchema,
  taskCommentSchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskRunSessionInspectionSchema,
  taskSchedulerStateListSchema,
  taskSchema,
  taskSubtaskInputSchema,
  taskSubtaskListSchema,
  taskSubtaskSchema,
  taskTemplateListSchema,
  taskTemplateRunNowInputSchema,
  taskTemplateSchema,
  updateTaskCommentInputSchema,
  updateTaskInputSchema,
  updateTaskSubtaskInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createConversationService } from "../services/conversation-service.js";
import { createTaskExecutionService } from "../services/task-execution-service.js";
import { createTaskSchedulerService } from "../services/task-scheduler-service.js";
import { createTaskService } from "../services/task-service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1),
});

const taskRunParamsSchema = taskIdParamsSchema.extend({
  runId: z.string().min(1),
});

const taskCommentParamsSchema = taskIdParamsSchema.extend({
  commentId: z.string().min(1),
});

const taskSubtaskParamsSchema = taskIdParamsSchema.extend({
  subtaskId: z.string().min(1),
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
      logger: context.logger,
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
    async (request) =>
      executionService.queue(request.params.id, {
        triggerSource: "template",
        context: request.body.context,
        metadata: request.body.metadata,
      }),
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
    "/api/tasks/:id/comments",
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: taskCommentListSchema,
        },
      },
    },
    async (request) => service.listComments(request.params.id),
  );

  app.post(
    "/api/tasks/:id/comments",
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskCommentInputSchema,
        response: {
          201: taskCommentSchema,
        },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.createComment(request.params.id, request.body);
    },
  );

  app.patch(
    "/api/tasks/:id/comments/:commentId",
    {
      schema: {
        params: taskCommentParamsSchema,
        body: updateTaskCommentInputSchema,
        response: {
          200: taskCommentSchema,
        },
      },
    },
    async (request) => {
      const comment = await service.updateComment(
        request.params.id,
        request.params.commentId,
        request.body,
      );

      if (!comment) {
        throw new NotFoundError("Task comment not found.");
      }

      return comment;
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
      const deleted = await service.delete(request.params.id);

      if (!deleted) {
        throw new NotFoundError("Task not found.");
      }

      reply.code(204);
    },
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
