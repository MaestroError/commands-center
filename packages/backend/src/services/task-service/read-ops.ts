// createTaskReadOps: task-service methods split out of the god-file (issue #99).

import type { TaskServiceRef } from "../task-service.js";
import type { TaskServiceContext } from "./context.js";
import {
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskFeedbackThreadListSchema,
  taskFeedbackThreadSchema,
  taskListSchema,
  taskRunListSchema,
  taskSubtaskListSchema,
  taskSubtaskProgressListSchema,
  taskTemplateListSchema,
  type ListTaskRunsQuery,
  type ListTasksQuery,
  type Task,
  type TaskFeedbackThread,
  type TaskRun,
  type TaskRunFollowup,
  type TaskSubtask,
  type TaskSubtaskProgress,
  type TaskTemplate,
} from "@cc/shared/schemas";
import { NotFoundError } from "../../lib/api-error.js";
import {
  mapSubtaskDetail,
  mapTask,
  mapTaskRun,
  mapTaskRunFollowup,
  mapTaskRunWithReplyState,
  mapTaskRunsWithReplyState,
  mapTaskSubtask,
  mapTaskTemplate,
  mapTemplateAsTask,
} from "./mappers.js";
import { deriveSubtaskStatus } from "./status.js";

export function createTaskReadOps(ctx: TaskServiceContext, service: TaskServiceRef) {
  const {
    getTaskRow,
    getTemplateRow,
    getTemplateTaskIds,
    options,
    requireTask,
    requireTaskRun,
    requireTemplate,
  } = ctx;
  return {
    async list(query: Partial<ListTasksQuery> = {}): Promise<Task[]> {
      const parsed = listTasksQuerySchema.parse(query);
      const rows = await options.db.query.tasks.findMany({
        where: (table, operators) => {
          const filters = [operators.isNull(table.deleted_at), operators.isNull(table.template_id)];

          if (!parsed.includeArchived) {
            filters.push(operators.eq(table.archived, false));
          }

          if (parsed.status) {
            filters.push(operators.eq(table.status, parsed.status));
          }

          if (parsed.agentId) {
            filters.push(operators.eq(table.agent_id, parsed.agentId));
          }

          if (parsed.sourceTemplateId) {
            filters.push(operators.eq(table.source_template_id, parsed.sourceTemplateId));
          }

          return operators.and(...filters);
        },
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });
      return taskListSchema.parse(rows.map(mapTask));
    },

    async get(id: string, getOptions?: { includeArchived?: boolean }): Promise<Task | undefined> {
      const row = await getTaskRow(id, getOptions);
      if (row) {
        return mapTask(row);
      }

      const template = await getTemplateRow(id, getOptions);
      return template ? mapTemplateAsTask(template) : undefined;
    },

    async listArchived(): Promise<Task[]> {
      return service.list({ includeArchived: true, status: "archived" });
    },

    async listTemplates(filter: { defaultAgentId?: string } = {}): Promise<TaskTemplate[]> {
      const rows = await options.db.query.task_templates.findMany({
        where: (table, operators) => {
          const filters = [operators.isNull(table.deleted_at)];

          if (filter.defaultAgentId) {
            filters.push(operators.eq(table.default_agent_id, filter.defaultAgentId));
          }

          return operators.and(...filters);
        },
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });

      return taskTemplateListSchema.parse(rows.map(mapTaskTemplate));
    },

    async getTemplate(id: string): Promise<TaskTemplate | undefined> {
      const row = await getTemplateRow(id);
      return row ? mapTaskTemplate(row) : undefined;
    },

    async listFeedback(taskId: string): Promise<TaskFeedbackThread[]> {
      await requireTask(taskId, { includeArchived: true });
      const rows = await options.db.query.task_feedback.findMany({
        where: (table, operators) =>
          operators.and(operators.eq(table.task_id, taskId), operators.isNull(table.deleted_at)),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });
      const subtasks = await service.listSubtasks(taskId);
      const runs = await service.listRuns(taskId);

      return taskFeedbackThreadListSchema.parse(
        rows.map((row) =>
          taskFeedbackThreadSchema.parse({
            id: row.id,
            taskId: row.task_id,
            body: row.body,
            targetAgentIds: subtasks
              .filter((subtask) => subtask.feedbackId === row.id)
              .map((subtask) => subtask.agentId),
            subtasks: subtasks
              .filter((subtask) => subtask.feedbackId === row.id)
              .map((subtask) => mapSubtaskDetail(subtask, runs)),
            createdAt: row.created_at.toISOString(),
          }),
        ),
      );
    },

    async listFollowups(runId: string): Promise<TaskRunFollowup[]> {
      await requireTaskRun(runId);
      const rows = await options.db.query.task_run_followups.findMany({
        where: (table, operators) => operators.eq(table.run_id, runId),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });

      return rows.map(mapTaskRunFollowup);
    },

    async findInFlightFollowup(runId: string): Promise<TaskRunFollowup | undefined> {
      const row = await options.db.query.task_run_followups.findFirst({
        where: (table, operators) =>
          operators.and(operators.eq(table.run_id, runId), operators.eq(table.status, "sending")),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return row ? mapTaskRunFollowup(row) : undefined;
    },

    async listSubtasks(taskId: string): Promise<TaskSubtask[]> {
      await requireTask(taskId, { includeArchived: true });
      const rows = await options.db.query.task_subtasks.findMany({
        where: (table, operators) =>
          operators.and(operators.eq(table.task_id, taskId), operators.isNull(table.deleted_at)),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });

      return taskSubtaskListSchema.parse(rows.map(mapTaskSubtask));
    },

    async listSubtaskProgress(taskIds: string[]): Promise<TaskSubtaskProgress[]> {
      const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));

      if (uniqueTaskIds.length === 0) {
        return [];
      }

      const [subtaskRows, runRows] = await Promise.all([
        options.db.query.task_subtasks.findMany({
          where: (table, operators) =>
            operators.and(
              operators.inArray(table.task_id, uniqueTaskIds),
              operators.isNull(table.deleted_at),
            ),
          orderBy: (table, operators) => [operators.asc(table.created_at)],
        }),
        options.db.query.task_runs.findMany({
          where: (table, operators) => operators.inArray(table.task_id, uniqueTaskIds),
          orderBy: (table, operators) => [operators.desc(table.created_at)],
        }),
      ]);
      const runs = runRows.map(mapTaskRun);

      return taskSubtaskProgressListSchema.parse(
        uniqueTaskIds.map((taskId) => {
          const taskSubtasks = subtaskRows
            .filter((subtask) => subtask.task_id === taskId)
            .map(mapTaskSubtask);
          const subtasks = taskSubtasks.map((subtask) => ({
            id: subtask.id,
            description: subtask.description,
            status: deriveSubtaskStatus(subtask, runs),
          }));
          const statuses = subtasks.map((subtask) => subtask.status);

          return {
            taskId,
            total: taskSubtasks.length,
            completed: statuses.filter((status) => status === "done").length,
            active: statuses.filter((status) => status === "queued" || status === "running").length,
            review: statuses.filter((status) => status === "review").length,
            failed: statuses.filter((status) => status === "failed").length,
            subtasks,
          };
        }),
      );
    },

    async listDueScheduledTasks(at: Date): Promise<Task[]> {
      const rows = await options.db.query.tasks.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.status, "scheduled"),
            operators.lte(table.scheduled_at, at),
            operators.eq(table.archived, false),
            operators.isNull(table.deleted_at),
          ),
        orderBy: (table, operators) => [operators.asc(table.scheduled_at)],
      });

      return taskListSchema.parse(rows.map(mapTask));
    },

    async listRecurringTemplates(): Promise<Task[]> {
      const rows = await options.db.query.task_templates.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.enabled, true),
            operators.eq(table.archived, false),
            operators.isNotNull(table.recurrence_json),
            operators.isNull(table.deleted_at),
          ),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });

      return taskListSchema.parse(rows.map(mapTemplateAsTask));
    },

    async listDoneTasksReadyToArchive(before: Date): Promise<Task[]> {
      const rows = await options.db.query.tasks.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.status, "done"),
            operators.eq(table.archived, false),
            operators.lte(table.done_at, before),
            operators.isNull(table.deleted_at),
          ),
      });

      return taskListSchema.parse(rows.map(mapTask));
    },

    async listTemplateTasks(templateId: string): Promise<Task[]> {
      await requireTemplate(templateId, { includeArchived: true });
      const rows = await options.db.query.tasks.findMany({
        where: (table, operators) =>
          operators.and(
            operators.or(
              operators.and(
                operators.eq(table.template_id, templateId),
                operators.ne(table.id, templateId),
              ),
              operators.eq(table.source_template_id, templateId),
            ),
            operators.isNull(table.deleted_at),
          ),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return taskListSchema.parse(rows.map(mapTask));
    },

    async listRuns(taskId: string, query: Partial<ListTaskRunsQuery> = {}): Promise<TaskRun[]> {
      const task = await getTaskRow(taskId, { includeArchived: true });
      const template = task ? undefined : await getTemplateRow(taskId, { includeArchived: true });

      if (!task && !template) {
        throw new NotFoundError("Task not found.");
      }

      const parsed = listTaskRunsQuerySchema.parse(query);
      const taskIds = template ? await getTemplateTaskIds(template.id) : [taskId];

      if (taskIds.length === 0) {
        return [];
      }

      const rows = await options.db.query.task_runs.findMany({
        where: (table, operators) => {
          const filters = [operators.inArray(table.task_id, taskIds)];

          if (parsed.status) {
            filters.push(operators.eq(table.status, parsed.status));
          }

          if (parsed.triggerSource) {
            filters.push(operators.eq(table.trigger_source, parsed.triggerSource));
          }

          return operators.and(...filters);
        },
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return taskRunListSchema.parse(
        await mapTaskRunsWithReplyState(options.db, options.config, rows),
      );
    },

    async getRun(taskId: string, runId: string): Promise<TaskRun | undefined> {
      const task = await getTaskRow(taskId, { includeArchived: true });
      const template = task ? undefined : await getTemplateRow(taskId, { includeArchived: true });

      if (!task && !template) {
        throw new NotFoundError("Task not found.");
      }

      const taskIds = template ? await getTemplateTaskIds(template.id) : [taskId];

      if (taskIds.length === 0) {
        return undefined;
      }

      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(operators.inArray(table.task_id, taskIds), operators.eq(table.id, runId)),
      });

      return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
    },

    async getRunById(runId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, runId),
      });

      return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      const rows = await options.db.query.task_runs.findMany({
        where: (table, operators) => operators.inArray(table.status, ["queued", "running"]),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return taskRunListSchema.parse(
        await mapTaskRunsWithReplyState(options.db, options.config, rows),
      );
    },

    async getActiveRunForTask(taskId: string, subtaskId?: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.task_id, taskId),
            subtaskId
              ? operators.eq(table.subtask_id, subtaskId)
              : operators.isNull(table.subtask_id),
            operators.inArray(table.status, ["queued", "running"]),
          ),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
    },

    async getRunningRunForAgent(agentId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.agent_id, agentId),
            operators.eq(table.status, "running"),
          ),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });

      return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
    },

    async getNextQueuedRunForAgent(agentId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.agent_id, agentId),
            operators.eq(table.status, "queued"),
          ),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });

      return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
    },
  };
}
