import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskSchema,
  updateTaskInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createTaskService } from "../services/task-service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1),
});

const taskRunParamsSchema = taskIdParamsSchema.extend({
  runId: z.string().min(1),
});

export function registerTaskRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createTaskService({
    db: context.database.db,
    config: context.config,
  });

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
}
