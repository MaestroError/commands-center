import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  createTaskInputSchema,
  appendTaskContextInputSchema,
  createTaskTemplateInputSchema,
  createTaskRunInputSchema,
  addTaskRunArtifactInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  markTaskRunNeedsReviewInputSchema,
  queueTaskInputSchema,
  recurringTaskScheduleSchema,
  setTaskRunResultInputSchema,
  createTaskFeedbackInputSchema,
  taskFeedbackThreadListSchema,
  taskFeedbackThreadSchema,
  taskContextInputSchema,
  taskContextSchema,
  taskListSchema,
  taskPermissionProfileSchema,
  taskRunArtifactSchema,
  taskRunListSchema,
  taskRunSchema,
  taskScheduleSchema,
  taskSchema,
  taskSubtaskInputSchema,
  taskSubtaskListSchema,
  taskSubtaskProgressListSchema,
  taskSubtaskSchema,
  taskTemplateListSchema,
  taskTemplateSchema,
  taskTodoInputSchema,
  taskTodoSchema,
  updateTaskInputSchema,
  updateTaskRunInputSchema,
  updateTaskSubtaskInputSchema,
  type CreateTaskInput,
  type AppendTaskContextInput,
  type CreateTaskTemplateInput,
  type CreateTaskRunInput,
  type TaskRunArtifact,
  type ListTaskRunsQuery,
  type ListTasksQuery,
  type QueueTaskInput,
  type Task,
  type TaskContext,
  type TaskFeedbackThread,
  type TaskRun,
  type TaskRunStatus,
  type TaskSchedule,
  type TaskSubtask,
  type TaskSubtaskDerivedStatus,
  type TaskSubtaskProgress,
  type TaskTemplate,
  type TaskStatus,
  type TaskTodo,
  type UpdateTaskInput,
  type UpdateTaskRunInput,
  type UpdateTaskSubtaskInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import {
  task_feedback,
  task_runs,
  task_subtasks,
  task_templates,
  tasks,
} from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

export type TaskService = ReturnType<typeof createTaskService>;

type QueueTaskOptions = QueueTaskInput & {
  id?: string;
  context?: TaskContext;
  renderedPrompt?: string;
  renderedContext?: Record<string, unknown>;
  effectivePermissions?: CreateTaskRunInput["effectivePermissions"];
};

type CreateTaskFromTemplateInput = {
  occurrenceAt?: string;
  scheduledFor?: string;
  triggerSource?: TaskRun["triggerSource"];
  context?: TaskContext;
};

export function createTaskService(options: { db: AppDb; config: RuntimeConfig }) {
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

          if (parsed.triggerMode) {
            filters.push(operators.eq(table.trigger_mode, parsed.triggerMode));
          }

          if (parsed.agentId) {
            filters.push(operators.eq(table.agent_id, parsed.agentId));
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
      return this.list({ includeArchived: true, status: "archived" });
    },

    async listTemplates(): Promise<TaskTemplate[]> {
      const rows = await options.db.query.task_templates.findMany({
        where: (table, operators) => operators.isNull(table.deleted_at),
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });

      return taskTemplateListSchema.parse(rows.map(mapTaskTemplate));
    },

    async getTemplate(id: string): Promise<TaskTemplate | undefined> {
      const row = await getTemplateRow(id);
      return row ? mapTaskTemplate(row) : undefined;
    },

    async createTemplate(input: CreateTaskTemplateInput): Promise<TaskTemplate> {
      const parsed = createTaskTemplateInputSchema.parse(input);
      await requireActiveAgent(parsed.defaultAgentId);
      await enforceTaskLimit();

      const timestamp = now();
      const todos = normalizeTodos(parsed.todos, timestamp);
      const enabled = parsed.enabled ?? true;
      const schedule = parsed.recurrence ?? { mode: "manual" };
      const [row] = await options.db
        .insert(task_templates)
        .values({
          id: createId(),
          agent_id: parsed.defaultAgentId,
          default_agent_id: parsed.defaultAgentId,
          title: parsed.title,
          description: parsed.description,
          todos_json: JSON.stringify(todos),
          status: enabled ? "enabled" : "disabled",
          trigger_mode: parsed.recurrence ? "recurring" : "manual",
          schedule_json: JSON.stringify(schedule),
          recurrence_json: parsed.recurrence ? JSON.stringify(parsed.recurrence) : null,
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived: false,
          latest_final_message: null,
          latest_task_id: null,
          next_occurrence_at: parsed.recurrence ? new Date(parsed.recurrence.anchorAt) : null,
          last_generated_occurrence_at: null,
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null,
          deleted_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task template record.");
      }

      return mapTaskTemplate(row);
    },

    async create(input: CreateTaskInput): Promise<Task> {
      const parsed = createTaskInputSchema.parse(input);
      await requireActiveAgent(parsed.agentId);
      await enforceTaskLimit();

      const timestamp = now();
      const triggerMode = parsed.triggerMode;
      const schedule = normalizeSchedule(triggerMode, parsed.schedule);
      const enabled = parsed.enabled ?? parsed.status !== "draft";
      const archived = parsed.status === "archived";
      const status = normalizeTaskStatus({
        requestedStatus: parsed.status,
        enabled,
        archived,
      });
      const defaultAgentId = parsed.defaultAgentId ?? parsed.agentId;
      const todos = normalizeTodos(parsed.todos, timestamp);
      const context = normalizeTaskContext(parsed.context);

      if (parsed.defaultAgentId) {
        await requireActiveAgent(parsed.defaultAgentId);
      }

      if (triggerMode !== "manual") {
        const id = createId();
        const [row] = await options.db
          .insert(task_templates)
          .values({
            id,
            agent_id: parsed.agentId,
            default_agent_id: defaultAgentId,
            title: parsed.title,
            description: parsed.description,
            todos_json: JSON.stringify(todos),
            status,
            trigger_mode: triggerMode,
            schedule_json: JSON.stringify(schedule),
            permission_profile_json: stringifyOptional(parsed.permissionProfile),
            enabled,
            archived,
            latest_final_message: null,
            latest_task_id: null,
            next_occurrence_at: schedule.mode === "recurring" ? new Date(schedule.anchorAt) : null,
            created_at: timestamp,
            updated_at: timestamp,
            archived_at: archived ? timestamp : null,
            deleted_at: null,
          })
          .returning();

        if (!row) {
          throw new Error("Failed to create task template record.");
        }

        await options.db.insert(tasks).values({
          id,
          template_id: id,
          agent_id: parsed.agentId,
          default_agent_id: defaultAgentId,
          title: parsed.title,
          description: parsed.description,
          context: JSON.stringify(context),
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          trigger_source: null,
          schedule_json: JSON.stringify(schedule),
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_final_message: null,
          source_template_id: null,
          source_occurrence_at: null,
          scheduled_at: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
          scheduled_for: null,
          due_at: parsed.dueAt ? new Date(parsed.dueAt) : null,
          done_at: null,
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: archived ? timestamp : null,
          deleted_at: null,
        });

        return mapTemplateAsTask(row);
      }

      const [row] = await options.db
        .insert(tasks)
        .values({
          id: createId(),
          template_id: null,
          agent_id: parsed.agentId,
          default_agent_id: defaultAgentId,
          title: parsed.title,
          description: parsed.description,
          context: JSON.stringify(context),
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          trigger_source: "manual",
          schedule_json: JSON.stringify(schedule),
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_final_message: null,
          latest_run_id: null,
          source_template_id: null,
          source_occurrence_at: null,
          scheduled_at: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
          scheduled_for: null,
          due_at: parsed.dueAt ? new Date(parsed.dueAt) : null,
          done_at: null,
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: archived ? timestamp : null,
          deleted_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task record.");
      }

      return mapTask(row);
    },

    async duplicate(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id, { includeArchived: true });
      const existingTemplate = existing
        ? undefined
        : await getTemplateRow(id, { includeArchived: true });

      if (!existing && !existingTemplate) {
        return undefined;
      }

      const task = existing ? mapTask(existing) : mapTemplateAsTask(existingTemplate!);

      return this.create({
        agentId: task.agentId,
        title: `${task.title} copy`,
        description: task.description,
        context: task.context,
        todos: task.todos.map((todo) => ({ content: todo.content, status: todo.status })),
        triggerMode: task.triggerMode,
        schedule: task.schedule,
        permissionProfile: task.permissionProfile,
        enabled: false,
      });
    },

    async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
      const parsed = updateTaskInputSchema.parse(input);
      const existing = await getTaskRow(id);

      if (!existing) {
        return undefined;
      }

      if (parsed.agentId) {
        await requireActiveAgent(parsed.agentId);
      }

      if (parsed.defaultAgentId) {
        await requireActiveAgent(parsed.defaultAgentId);
      }

      const timestamp = now();
      const triggerMode = parsed.triggerMode ?? existing.trigger_mode;
      const schedule = normalizeSchedule(
        triggerMode,
        parsed.schedule ?? parseTaskSchedule(existing.schedule_json),
      );
      const archived = parsed.status === "archived" ? true : existing.archived;
      const enabled =
        parsed.enabled ??
        (parsed.status === "enabled"
          ? true
          : parsed.status === "disabled" || parsed.status === "draft"
            ? false
            : existing.enabled);
      const status = normalizeTaskStatus({
        requestedStatus: parsed.status,
        enabled,
        archived,
        fallbackStatus: existing.status as TaskStatus,
      });
      const todos = parsed.todos
        ? normalizeTodos(parsed.todos, timestamp)
        : parseTaskTodos(existing.todos_json);

      const [row] = await options.db
        .update(tasks)
        .set({
          agent_id: parsed.agentId ?? existing.agent_id,
          default_agent_id: parsed.defaultAgentId ?? existing.default_agent_id,
          title: parsed.title ?? existing.title,
          description: parsed.description ?? existing.description,
          context:
            parsed.context === undefined
              ? existing.context
              : JSON.stringify(normalizeTaskContext(parsed.context)),
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          schedule_json: JSON.stringify(schedule),
          permission_profile_json:
            parsed.permissionProfile === undefined
              ? existing.permission_profile_json
              : stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          scheduled_at: parsed.scheduledAt ? new Date(parsed.scheduledAt) : existing.scheduled_at,
          due_at: parsed.dueAt ? new Date(parsed.dueAt) : existing.due_at,
          updated_at: timestamp,
          archived_at: archived ? (existing.archived_at ?? timestamp) : null,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to update task record.");
      }

      return mapTask(row);
    },

    async updateContext(id: string, input: TaskContext): Promise<Task | undefined> {
      const context = normalizeTaskContext(input);
      const [row] = await options.db
        .update(tasks)
        .set({
          context: JSON.stringify(context),
          updated_at: now(),
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at), isNull(tasks.template_id)))
        .returning();

      return row ? mapTask(row) : undefined;
    },

    async appendContext(id: string, input: AppendTaskContextInput): Promise<Task | undefined> {
      const parsed = appendTaskContextInputSchema.parse(input);
      const task = await this.get(id);

      if (!task || task.templateId === task.id) {
        return undefined;
      }

      const text = [task.context.text, parsed.text].filter(Boolean).join("\n\n");
      return this.updateContext(id, { ...task.context, text });
    },

    async archive(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id);

      if (!existing) {
        return undefined;
      }

      const timestamp = now();

      const [row] = await options.db
        .update(tasks)
        .set({
          status: "archived",
          archived: true,
          updated_at: timestamp,
          archived_at: existing.archived_at ?? timestamp,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to archive task record.");
      }

      return mapTask(row);
    },

    archiveTask(id: string): Promise<Task | undefined> {
      return this.archive(id);
    },

    async restore(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id, { includeArchived: true });

      if (!existing) {
        return undefined;
      }

      const timestamp = now();

      const [row] = await options.db
        .update(tasks)
        .set({
          status: existing.enabled ? "enabled" : "disabled",
          archived: false,
          updated_at: timestamp,
          archived_at: null,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to restore task record.");
      }

      return mapTask(row);
    },

    restoreTask(id: string): Promise<Task | undefined> {
      return this.restore(id);
    },

    async acceptTask(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id);

      if (!existing) {
        return undefined;
      }

      if (existing.archived) {
        throw new BadRequestError("Archived tasks cannot be accepted.");
      }

      const timestamp = now();
      const [row] = await options.db
        .update(tasks)
        .set({
          status: "done",
          done_at: timestamp,
          updated_at: timestamp,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to accept task record.");
      }

      return mapTask(row);
    },

    async listFeedback(taskId: string): Promise<TaskFeedbackThread[]> {
      await requireTask(taskId, { includeArchived: true });
      const rows = await options.db.query.task_feedback.findMany({
        where: (table, operators) =>
          operators.and(operators.eq(table.task_id, taskId), operators.isNull(table.deleted_at)),
        orderBy: (table, operators) => [operators.asc(table.created_at)],
      });
      const subtasks = await this.listSubtasks(taskId);
      const runs = await this.listRuns(taskId);

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

    async createFeedback(taskId: string, input: unknown): Promise<TaskFeedbackThread> {
      const task = await requireTask(taskId, { includeArchived: true });
      const parsed = createTaskFeedbackInputSchema.parse(input);
      const targetAgentIds =
        parsed.mentionedAgentIds.length > 0
          ? parsed.mentionedAgentIds
          : [task.default_agent_id ?? task.agent_id];

      await Promise.all(targetAgentIds.map((agentId) => requireActiveAgent(agentId)));

      const timestamp = now();
      const feedbackId = createId();
      const rows = options.db.transaction((tx) => {
        const feedback = tx
          .insert(task_feedback)
          .values({
            id: feedbackId,
            task_id: task.id,
            body: parsed.body,
            created_at: timestamp,
            updated_at: timestamp,
            deleted_at: null,
          })
          .returning()
          .get();

        if (!feedback) {
          throw new Error("Failed to create task feedback record.");
        }

        return targetAgentIds.map((agentId) => {
          const subtask = tx
            .insert(task_subtasks)
            .values({
              id: createId(),
              task_id: task.id,
              feedback_id: feedback.id,
              agent_id: agentId,
              description: parsed.body,
              created_at: timestamp,
              updated_at: timestamp,
              deleted_at: null,
            })
            .returning()
            .get();

          if (!subtask) {
            throw new Error("Failed to create task subtask record.");
          }

          return subtask;
        });
      });

      return taskFeedbackThreadSchema.parse({
        id: feedbackId,
        taskId: task.id,
        body: parsed.body,
        targetAgentIds,
        subtasks: rows.map((row) => mapSubtaskDetail(mapTaskSubtask(row), [])),
        createdAt: timestamp.toISOString(),
      });
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
            subtasks,
          };
        }),
      );
    },

    async createSubtask(taskId: string, input: unknown): Promise<TaskSubtask> {
      await requireTask(taskId, { includeArchived: true });
      const parsed = taskSubtaskInputSchema.parse(input);

      await requireActiveAgent(parsed.agentId);

      const timestamp = now();
      const [row] = await options.db
        .insert(task_subtasks)
        .values({
          id: createId(),
          task_id: taskId,
          feedback_id: null,
          agent_id: parsed.agentId,
          description: parsed.description,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task subtask record.");
      }

      return mapTaskSubtask(row);
    },

    async updateSubtask(
      taskId: string,
      subtaskId: string,
      input: UpdateTaskSubtaskInput,
    ): Promise<TaskSubtask | undefined> {
      await requireTask(taskId, { includeArchived: true });
      const parsed = updateTaskSubtaskInputSchema.parse(input);

      if (parsed.agentId) {
        await requireActiveAgent(parsed.agentId);
      }

      const existing = await options.db.query.task_subtasks.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.id, subtaskId),
            operators.eq(table.task_id, taskId),
            operators.isNull(table.deleted_at),
          ),
      });

      if (!existing) {
        return undefined;
      }

      const timestamp = now();
      const [row] = await options.db
        .update(task_subtasks)
        .set({
          description: parsed.description ?? existing.description,
          agent_id: parsed.agentId ?? existing.agent_id,
          updated_at: timestamp,
        })
        .where(
          and(
            eq(task_subtasks.id, subtaskId),
            eq(task_subtasks.task_id, taskId),
            isNull(task_subtasks.deleted_at),
          ),
        )
        .returning();

      if (!row) {
        throw new Error("Failed to update task subtask record.");
      }

      return mapTaskSubtask(row);
    },

    async enable(id: string): Promise<Task | undefined> {
      return setEnabled(id, true);
    },

    async disable(id: string): Promise<Task | undefined> {
      return setEnabled(id, false);
    },

    async delete(id: string): Promise<boolean> {
      const existing = await getTaskRow(id, { includeArchived: true });
      const existingTemplate = existing
        ? undefined
        : await getTemplateRow(id, { includeArchived: true });

      if (!existing && !existingTemplate) {
        return false;
      }

      const timestamp = now();

      if (existingTemplate) {
        return Promise.resolve(
          options.db.transaction((tx) => {
            const row = tx
              .update(task_templates)
              .set({
                enabled: false,
                updated_at: timestamp,
                deleted_at: timestamp,
              })
              .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
              .returning({ id: task_templates.id })
              .get();

            if (!row) {
              return false;
            }

            tx.update(tasks)
              .set({
                enabled: false,
                updated_at: timestamp,
                deleted_at: timestamp,
              })
              .where(and(eq(tasks.id, id), eq(tasks.template_id, id), isNull(tasks.deleted_at)))
              .returning({ id: tasks.id })
              .get();

            return true;
          }),
        );
      }

      const [row] = await options.db
        .update(tasks)
        .set({
          enabled: false,
          updated_at: timestamp,
          deleted_at: timestamp,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
        .returning({ id: tasks.id });

      return row !== undefined;
    },

    async createTaskFromTemplate(
      templateId: string,
      input: CreateTaskFromTemplateInput = {},
    ): Promise<Task | undefined> {
      const template = await getTemplateRow(templateId);

      if (!template) {
        return undefined;
      }

      const timestamp = now();
      const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      const occurrenceAt = input.occurrenceAt
        ? new Date(input.occurrenceAt)
        : (scheduledFor ?? timestamp);
      const existing = await options.db.query.tasks.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.source_template_id, template.id),
            operators.eq(table.source_occurrence_at, occurrenceAt),
            operators.isNull(table.deleted_at),
          ),
      });

      if (existing) {
        return mapTask(existing);
      }

      const [row] = await options.db
        .insert(tasks)
        .values({
          id: createId(),
          template_id: null,
          agent_id: template.agent_id,
          default_agent_id: template.default_agent_id,
          title: template.title,
          description: template.description,
          context: JSON.stringify(normalizeTaskContext(input.context)),
          todos_json: template.todos_json,
          status: scheduledFor ? "scheduled" : "backlog",
          trigger_mode: "manual",
          trigger_source: input.triggerSource ?? "scheduled",
          schedule_json: JSON.stringify({ mode: "manual" }),
          permission_profile_json: template.permission_profile_json,
          enabled: true,
          archived: false,
          latest_final_message: null,
          latest_run_id: null,
          source_template_id: template.id,
          source_occurrence_at: occurrenceAt,
          scheduled_at: scheduledFor,
          scheduled_for: scheduledFor,
          due_at: scheduledFor,
          done_at: null,
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null,
          deleted_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task occurrence record.");
      }

      await options.db
        .update(task_templates)
        .set({
          latest_task_id: row.id,
          last_generated_occurrence_at: occurrenceAt,
          updated_at: timestamp,
        })
        .where(eq(task_templates.id, template.id));

      return mapTask(row);
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
            operators.eq(table.trigger_mode, "recurring"),
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

      return taskRunListSchema.parse(rows.map(mapTaskRun));
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

      return row ? mapTaskRun(row) : undefined;
    },

    async getRunById(runId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, runId),
      });

      return row ? mapTaskRun(row) : undefined;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      const rows = await options.db.query.task_runs.findMany({
        where: (table, operators) => operators.inArray(table.status, ["queued", "running"]),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return taskRunListSchema.parse(rows.map(mapTaskRun));
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

      return row ? mapTaskRun(row) : undefined;
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

      return row ? mapTaskRun(row) : undefined;
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

      return row ? mapTaskRun(row) : undefined;
    },

    async tryStartQueuedRun(
      id: string,
      input: Omit<UpdateTaskRunInput, "status"> = {},
    ): Promise<TaskRun | undefined> {
      const existing = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing || existing.status !== "queued") {
        return undefined;
      }

      const running = await this.getRunningRunForAgent(existing.agent_id);

      if (running) {
        return undefined;
      }

      try {
        const [row] = await options.db
          .update(task_runs)
          .set({
            status: "running",
            started_at: input.startedAt ? new Date(input.startedAt) : existing.started_at,
            updated_at: now(),
          })
          .where(and(eq(task_runs.id, id), eq(task_runs.status, "queued")))
          .returning();

        return row ? mapTaskRun(row) : undefined;
      } catch (error) {
        if (isRunningAgentConstraintError(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async queueTask(input: QueueTaskOptions): Promise<TaskRun> {
      const parsed = queueTaskInputSchema.parse(input);
      const task = await requireTask(parsed.taskId, { includeArchived: true });

      if (task.archived) {
        throw new BadRequestError("Archived tasks cannot be queued.");
      }

      if (!task.enabled || task.status === "disabled" || task.status === "draft") {
        throw new BadRequestError("Task must be enabled before it can be queued.");
      }

      const activeRun = await this.getActiveRunForTask(task.id, parsed.subtaskId);

      if (activeRun) {
        throw new ConflictError("Task already has an active run.", { runId: activeRun.id });
      }

      const subtask = parsed.subtaskId
        ? await options.db.query.task_subtasks.findFirst({
            where: (table, operators) =>
              operators.and(
                operators.eq(table.id, parsed.subtaskId ?? ""),
                operators.eq(table.task_id, task.id),
                operators.isNull(table.deleted_at),
              ),
          })
        : undefined;

      if (parsed.subtaskId && !subtask) {
        throw new NotFoundError("Task subtask not found.");
      }

      const run = await this.createRun({
        id: input.id,
        taskId: task.id,
        subtaskId: parsed.subtaskId,
        agentId: parsed.agentId ?? subtask?.agent_id ?? task.default_agent_id ?? task.agent_id,
        status: "queued",
        triggerSource: parsed.triggerSource,
        context: input.context,
        triggerMetadata: parsed.metadata,
        renderedPrompt: input.renderedPrompt ?? "",
        renderedContext: input.renderedContext,
        effectivePermissions: input.effectivePermissions,
      });
      const timestamp = now();

      await options.db
        .update(tasks)
        .set({
          status: "queued",
          latest_run_id: run.id,
          updated_at: timestamp,
        })
        .where(and(eq(tasks.id, task.id), isNull(tasks.deleted_at)));

      return run;
    },

    async createRun(input: CreateTaskRunInput): Promise<TaskRun> {
      const parsed = createTaskRunInputSchema.parse(input);
      await requireTask(parsed.taskId, {
        includeArchived: true,
        includeTemplateProxy: true,
      });

      await requireActiveAgent(parsed.agentId);

      const timestamp = now();
      const [row] = await options.db
        .insert(task_runs)
        .values({
          id: parsed.id ?? createId(),
          task_id: parsed.taskId,
          subtask_id: parsed.subtaskId ?? null,
          agent_id: parsed.agentId,
          opencode_session_id: parsed.opencodeSessionId ?? null,
          status: parsed.status,
          trigger_source: parsed.triggerSource,
          outcome: parsed.outcome ?? null,
          context_json: stringifyOptional(parsed.context),
          trigger_metadata_json: stringifyOptional(parsed.triggerMetadata),
          rendered_prompt: parsed.renderedPrompt,
          rendered_context_json: stringifyOptional(parsed.renderedContext),
          effective_permissions_json: stringifyOptional(parsed.effectivePermissions),
          final_message: parsed.finalMessage ?? null,
          result_text: parsed.resultText ?? null,
          artifacts_json: JSON.stringify(parsed.artifacts),
          needs_human_review: parsed.needsHumanReview,
          human_review_reason: parsed.humanReviewReason ?? null,
          result_json: stringifyOptional(parsed.result),
          error_message: parsed.errorMessage ?? null,
          error_details_json: stringifyOptional(parsed.errorDetails),
          started_at: parsed.startedAt ? new Date(parsed.startedAt) : null,
          completed_at: parsed.completedAt ? new Date(parsed.completedAt) : null,
          cancelled_at: parsed.cancelledAt ? new Date(parsed.cancelledAt) : null,
          cancellation_reason: parsed.cancellationReason ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task run record.");
      }

      return mapTaskRun(row);
    },

    async updateRun(id: string, input: UpdateTaskRunInput): Promise<TaskRun | undefined> {
      const parsed = updateTaskRunInputSchema.parse(input);
      const existing = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      const [row] = await options.db
        .update(task_runs)
        .set({
          opencode_session_id: parsed.opencodeSessionId ?? existing.opencode_session_id,
          subtask_id: parsed.subtaskId ?? existing.subtask_id,
          status: parsed.status ?? existing.status,
          outcome: parsed.outcome ?? existing.outcome,
          context_json:
            parsed.context === undefined
              ? existing.context_json
              : stringifyOptional(parsed.context),
          trigger_metadata_json:
            parsed.triggerMetadata === undefined
              ? existing.trigger_metadata_json
              : stringifyOptional(parsed.triggerMetadata),
          rendered_prompt: parsed.renderedPrompt ?? existing.rendered_prompt,
          rendered_context_json:
            parsed.renderedContext === undefined
              ? existing.rendered_context_json
              : stringifyOptional(parsed.renderedContext),
          effective_permissions_json:
            parsed.effectivePermissions === undefined
              ? existing.effective_permissions_json
              : stringifyOptional(parsed.effectivePermissions),
          final_message: parsed.finalMessage ?? existing.final_message,
          result_text: parsed.resultText ?? existing.result_text,
          artifacts_json:
            parsed.artifacts === undefined
              ? existing.artifacts_json
              : JSON.stringify(parsed.artifacts),
          needs_human_review: parsed.needsHumanReview ?? existing.needs_human_review,
          human_review_reason: parsed.humanReviewReason ?? existing.human_review_reason,
          result_json:
            parsed.result === undefined ? existing.result_json : stringifyOptional(parsed.result),
          error_message: parsed.errorMessage ?? existing.error_message,
          error_details_json:
            parsed.errorDetails === undefined
              ? existing.error_details_json
              : stringifyOptional(parsed.errorDetails),
          started_at: parsed.startedAt ? new Date(parsed.startedAt) : existing.started_at,
          completed_at: parsed.completedAt ? new Date(parsed.completedAt) : existing.completed_at,
          cancelled_at: parsed.cancelledAt ? new Date(parsed.cancelledAt) : existing.cancelled_at,
          cancellation_reason: parsed.cancellationReason ?? existing.cancellation_reason,
          updated_at: now(),
        })
        .where(eq(task_runs.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update task run record.");
      }

      return mapTaskRun(row);
    },

    async setRunStatus(
      id: string,
      status: TaskRunStatus,
      input: Omit<UpdateTaskRunInput, "status"> = {},
    ): Promise<TaskRun | undefined> {
      const run = await this.updateRun(id, { ...input, status });

      if (run) {
        await applyTaskStatusForTerminalRun(run);
      }

      return run;
    },

    async setRunResultText(
      taskRunId: string,
      agentId: string,
      resultText: string,
    ): Promise<TaskRun> {
      const parsed = setTaskRunResultInputSchema.parse({ taskRunId, resultText });
      await requireWritableRun(parsed.taskRunId, agentId);
      const updated = await this.updateRun(parsed.taskRunId, { resultText: parsed.resultText });

      if (!updated) {
        throw new NotFoundError("Task run not found.");
      }

      return updated;
    },

    addRunArtifact(
      taskRunId: string,
      agentId: string,
      artifact: TaskRunArtifact,
    ): Promise<TaskRun> {
      const parsed = addTaskRunArtifactInputSchema.parse({ taskRunId, artifact });

      return Promise.resolve(
        options.db.transaction((tx) => {
          const run = tx.select().from(task_runs).where(eq(task_runs.id, parsed.taskRunId)).get();

          if (!run) {
            throw new NotFoundError("Task run not found.");
          }

          if (run.agent_id !== agentId) {
            throw new BadRequestError("Task run agent must match the calling agent.");
          }

          if (run.status !== "running") {
            throw new ConflictError("Only running task runs can be updated by an agent.");
          }

          const updated = tx
            .update(task_runs)
            .set({
              artifacts_json: JSON.stringify([...mapTaskRun(run).artifacts, parsed.artifact]),
              updated_at: now(),
            })
            .where(eq(task_runs.id, parsed.taskRunId))
            .returning()
            .get();

          if (!updated) {
            throw new NotFoundError("Task run not found.");
          }

          return mapTaskRun(updated);
        }),
      );
    },

    async markRunNeedsHumanReview(
      taskRunId: string,
      agentId: string,
      reason?: string,
    ): Promise<TaskRun> {
      const parsed = markTaskRunNeedsReviewInputSchema.parse({ taskRunId, reason });
      await requireWritableRun(parsed.taskRunId, agentId);
      const updated = await this.updateRun(parsed.taskRunId, {
        needsHumanReview: true,
        humanReviewReason: parsed.reason,
      });

      if (!updated) {
        throw new NotFoundError("Task run not found.");
      }

      return updated;
    },
  };

  async function requireWritableRun(taskRunId: string, agentId: string): Promise<TaskRun> {
    const run = await options.db.query.task_runs.findFirst({
      where: (table, operators) => operators.eq(table.id, taskRunId),
    });

    if (!run) {
      throw new NotFoundError("Task run not found.");
    }

    if (run.agent_id !== agentId) {
      throw new BadRequestError("Task run agent must match the calling agent.");
    }

    if (run.status !== "running") {
      throw new ConflictError("Only running task runs can be updated by an agent.");
    }

    return mapTaskRun(run);
  }

  async function applyTaskStatusForTerminalRun(run: TaskRun): Promise<void> {
    const status = run.subtaskId
      ? await getTaskStatusAfterTerminalSubtaskRun(run)
      : getTaskStatusAfterTerminalRun(run);

    if (!status) {
      return;
    }

    const timestamp = now();

    await options.db
      .update(tasks)
      .set({
        status,
        latest_run_id: run.id,
        ...(run.finalMessage === undefined ? {} : { latest_final_message: run.finalMessage }),
        updated_at: timestamp,
      })
      .where(and(eq(tasks.id, run.taskId), isNull(tasks.deleted_at)));
  }

  async function getTaskStatusAfterTerminalSubtaskRun(
    run: TaskRun,
  ): Promise<TaskStatus | undefined> {
    const status = getTaskStatusAfterTerminalRun(run);

    if (!status) {
      return undefined;
    }

    const subtaskRows = await options.db.query.task_subtasks.findMany({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.task_id, run.taskId),
          operators.isNotNull(table.feedback_id),
          operators.isNull(table.deleted_at),
        ),
      orderBy: (table, operators) => [operators.asc(table.created_at)],
    });

    if (subtaskRows.length === 0) {
      return status;
    }

    const runRows = await options.db.query.task_runs.findMany({
      where: (table, operators) => operators.eq(table.task_id, run.taskId),
      orderBy: (table, operators) => [operators.desc(table.created_at)],
    });
    const runs = runRows.map(mapTaskRun);
    const subtaskIds = subtaskRows.map((subtask) => subtask.id);
    const hasPending = subtaskIds.some((subtaskId) => !hasTerminalSubtaskRun(subtaskId, runs));

    if (hasPending) {
      return "queued";
    }

    return subtaskIds.some((subtaskId) => hasFailedSubtaskRun(subtaskId, runs))
      ? "review"
      : "ready_to_check";
  }

  async function setEnabled(id: string, enabled: boolean): Promise<Task | undefined> {
    const existing = await getTaskRow(id);
    const existingTemplate = existing ? undefined : await getTemplateRow(id);

    if (!existing && !existingTemplate) {
      return undefined;
    }

    if ((existing ?? existingTemplate)?.archived) {
      throw new BadRequestError("Archived tasks cannot be enabled or disabled.");
    }

    const timestamp = now();

    if (existingTemplate) {
      const [row] = await options.db
        .update(task_templates)
        .set({
          enabled,
          status: enabled ? "enabled" : "disabled",
          updated_at: timestamp,
        })
        .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to update task template enabled state.");
      }

      return mapTemplateAsTask(row);
    }

    const [row] = await options.db
      .update(tasks)
      .set({
        enabled,
        status: enabled ? "enabled" : "disabled",
        updated_at: timestamp,
      })
      .where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
      .returning();

    if (!row) {
      throw new Error("Failed to update task enabled state.");
    }

    return mapTask(row);
  }

  async function requireActiveAgent(agentId: string): Promise<void> {
    const row = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.id, agentId),
    });

    if (!row || row.status === "archived") {
      throw new BadRequestError("Task agent must exist and be active.");
    }
  }

  async function enforceTaskLimit(): Promise<void> {
    if (options.config.tasks.maxTasks === undefined) {
      return;
    }

    const [row] = await options.db
      .select({ value: count() })
      .from(tasks)
      .where(isNull(tasks.deleted_at));

    if ((row?.value ?? 0) >= options.config.tasks.maxTasks) {
      throw new ConflictError("Maximum task limit reached.", {
        maxTasks: options.config.tasks.maxTasks,
      });
    }
  }

  async function requireTask(
    id: string,
    options?: { includeArchived?: boolean; includeTemplateProxy?: boolean },
  ): Promise<typeof tasks.$inferSelect> {
    const row = await getTaskRow(id, options);

    if (!row) {
      throw new NotFoundError("Task not found.");
    }

    return row;
  }

  async function requireTemplate(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<typeof task_templates.$inferSelect> {
    const row = await getTemplateRow(id, options);

    if (!row) {
      throw new NotFoundError("Task template not found.");
    }

    return row;
  }

  async function getTaskRow(
    id: string,
    getOptions?: { includeArchived?: boolean; includeTemplateProxy?: boolean },
  ): Promise<typeof tasks.$inferSelect | undefined> {
    return options.db.query.tasks.findFirst({
      where: (table, operators) => {
        const filters = [operators.eq(table.id, id), operators.isNull(table.deleted_at)];

        if (!getOptions?.includeTemplateProxy) {
          const nonTemplateProxyFilter = operators.or(
            operators.isNull(table.template_id),
            operators.ne(table.template_id, id),
          );

          if (nonTemplateProxyFilter) {
            filters.push(nonTemplateProxyFilter);
          }
        }

        if (!getOptions?.includeArchived) {
          filters.push(operators.eq(table.archived, false));
        }

        return operators.and(...filters);
      },
    });
  }

  async function getTemplateRow(
    id: string,
    _getOptions?: { includeArchived?: boolean },
  ): Promise<typeof task_templates.$inferSelect | undefined> {
    return options.db.query.task_templates.findFirst({
      where: (table, operators) =>
        operators.and(operators.eq(table.id, id), operators.isNull(table.deleted_at)),
    });
  }

  async function getTemplateTaskIds(templateId: string): Promise<string[]> {
    const rows = await options.db.query.tasks.findMany({
      where: (table, operators) =>
        operators.and(
          operators.or(
            operators.eq(table.template_id, templateId),
            operators.eq(table.source_template_id, templateId),
          ),
          operators.isNull(table.deleted_at),
        ),
      columns: { id: true },
    });

    return rows.map((row) => row.id);
  }
}

function normalizeSchedule(triggerMode: string, schedule?: TaskSchedule): TaskSchedule {
  if (!schedule) {
    if (triggerMode === "manual") {
      return { mode: "manual" };
    }

    throw new BadRequestError("Scheduled tasks require a schedule definition.");
  }

  const parsed = taskScheduleSchema.parse(schedule);

  if (parsed.mode !== triggerMode) {
    throw new BadRequestError("Task trigger mode must match schedule mode.");
  }

  return parsed;
}

function normalizeTaskStatus(input: {
  requestedStatus?: TaskStatus;
  enabled: boolean;
  archived: boolean;
  fallbackStatus?: TaskStatus;
}): TaskStatus {
  if (input.archived) {
    return "archived";
  }

  if (input.requestedStatus === "draft") {
    return "draft";
  }

  if (
    input.requestedStatus &&
    !["archived", "enabled", "disabled"].includes(input.requestedStatus)
  ) {
    return input.requestedStatus;
  }

  if (!input.enabled) {
    return "disabled";
  }

  if (input.fallbackStatus && !["archived", "disabled", "draft"].includes(input.fallbackStatus)) {
    return input.fallbackStatus;
  }

  return "enabled";
}

function normalizeTodos(input: unknown[], timestamp: Date): TaskTodo[] {
  return input.map((todo) => {
    const parsed = taskTodoInputSchema.parse(todo);
    const createdAt = parsed.createdAt ?? timestamp.toISOString();
    const completedAt =
      parsed.status === "completed" ? (parsed.completedAt ?? timestamp.toISOString()) : undefined;

    return taskTodoSchema.parse({
      ...parsed,
      id: parsed.id ?? createId(),
      createdAt,
      completedAt,
    });
  });
}

function getTaskStatusAfterTerminalRun(run: TaskRun): TaskStatus | undefined {
  if (run.status === "failed" || run.status === "cancelled") {
    return "review";
  }

  if (run.status !== "completed") {
    return undefined;
  }

  if (run.outcome === "failed" || run.outcome === "needs_human_review" || run.needsHumanReview) {
    return "review";
  }

  return "ready_to_check";
}

function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}

function hasFailedSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) =>
      run.subtaskId === subtaskId &&
      (run.status === "failed" ||
        run.status === "cancelled" ||
        run.outcome === "failed" ||
        run.outcome === "needs_human_review" ||
        run.needsHumanReview),
  );
}

function isRunningAgentConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("task_runs_agent_running_unique_idx") ||
      error.message.includes("UNIQUE constraint failed: task_runs.agent_id"))
  );
}

function mapTask(row: typeof tasks.$inferSelect): Task {
  return taskSchema.parse({
    id: row.id,
    templateId: row.template_id ?? undefined,
    agentId: row.agent_id,
    defaultAgentId: row.default_agent_id ?? undefined,
    title: row.title,
    description: row.description,
    context: parseTaskContext(row.context),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    triggerMode: row.trigger_mode,
    schedule: parseTaskSchedule(row.schedule_json),
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestFinalMessage: row.latest_final_message ?? undefined,
    latestRunId: row.latest_run_id ?? undefined,
    sourceTemplateId: row.source_template_id ?? undefined,
    sourceOccurrenceAt: row.source_occurrence_at?.toISOString(),
    scheduledAt: row.scheduled_at?.toISOString(),
    scheduledFor: row.scheduled_for?.toISOString(),
    dueAt: row.due_at?.toISOString(),
    doneAt: row.done_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

function mapTemplateAsTask(row: typeof task_templates.$inferSelect): Task {
  return taskSchema.parse({
    id: row.id,
    templateId: row.id,
    agentId: row.agent_id,
    defaultAgentId: row.default_agent_id ?? undefined,
    title: row.title,
    description: row.description,
    context: normalizeTaskContext(),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    triggerMode: row.trigger_mode,
    schedule: parseTaskSchedule(row.schedule_json),
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestFinalMessage: row.latest_final_message ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

function mapTaskTemplate(row: typeof task_templates.$inferSelect): TaskTemplate {
  return taskTemplateSchema.parse({
    id: row.id,
    defaultAgentId: row.default_agent_id ?? row.agent_id,
    title: row.title,
    description: row.description,
    todos: parseTaskTodos(row.todos_json),
    recurrence: row.recurrence_json
      ? recurringTaskScheduleSchema.parse(JSON.parse(row.recurrence_json))
      : undefined,
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    latestFinalMessage: row.latest_final_message ?? undefined,
    latestTaskId: row.latest_task_id ?? undefined,
    nextOccurrenceAt: row.next_occurrence_at?.toISOString(),
    lastGeneratedOccurrenceAt: row.last_generated_occurrence_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapTaskSubtask(row: typeof task_subtasks.$inferSelect): TaskSubtask {
  return taskSubtaskSchema.parse({
    id: row.id,
    taskId: row.task_id,
    feedbackId: row.feedback_id ?? undefined,
    agentId: row.agent_id,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapSubtaskDetail(subtask: TaskSubtask, runs: TaskRun[]) {
  const subtaskRuns = runs.filter((run) => run.subtaskId === subtask.id);
  const replies = [...subtaskRuns]
    .reverse()
    .map((run) => ({ run, status: deriveRunSubtaskStatus(run) }));

  return {
    ...subtask,
    status: deriveSubtaskStatus(subtask, runs),
    latestRun: subtaskRuns[0],
    replies,
  };
}

function deriveSubtaskStatus(subtask: TaskSubtask, runs: TaskRun[]): TaskSubtaskDerivedStatus {
  const latestRun = runs.find((run) => run.subtaskId === subtask.id);

  return latestRun ? deriveRunSubtaskStatus(latestRun) : "backlog";
}

function deriveRunSubtaskStatus(run: TaskRun): TaskSubtaskDerivedStatus {
  if (run.status === "queued" || run.status === "running") {
    return run.status;
  }

  if (
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.outcome === "failed" ||
    run.outcome === "needs_human_review" ||
    run.needsHumanReview
  ) {
    return "review";
  }

  if (run.status === "completed") {
    return "done";
  }

  return "backlog";
}

function mapTaskRun(row: typeof task_runs.$inferSelect): TaskRun {
  return taskRunSchema.parse({
    id: row.id,
    taskId: row.task_id,
    subtaskId: row.subtask_id ?? undefined,
    agentId: row.agent_id,
    opencodeSessionId: row.opencode_session_id ?? undefined,
    status: row.status,
    triggerSource: row.trigger_source,
    outcome: row.outcome ?? undefined,
    renderedPrompt: row.rendered_prompt,
    context: parseJsonRecord(row.context_json),
    triggerMetadata: parseJsonRecord(row.trigger_metadata_json),
    renderedContext: parseJsonRecord(row.rendered_context_json),
    effectivePermissions: parseOptional(
      row.effective_permissions_json,
      taskPermissionProfileSchema,
    ),
    finalMessage: row.final_message ?? undefined,
    resultText: row.result_text ?? undefined,
    artifacts: parseTaskRunArtifacts(row.artifacts_json),
    needsHumanReview: row.needs_human_review ?? false,
    humanReviewReason: row.human_review_reason ?? undefined,
    result: parseJsonRecord(row.result_json),
    errorMessage: row.error_message ?? undefined,
    errorDetails: parseJsonRecord(row.error_details_json),
    startedAt: row.started_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    cancellationReason: row.cancellation_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseTaskSchedule(value: string): TaskSchedule {
  return taskScheduleSchema.parse(JSON.parse(value));
}

function parseTaskTodos(value: string): TaskTodo[] {
  return taskTodoSchema.array().parse(JSON.parse(value));
}

function normalizeTaskContext(input?: unknown): TaskContext {
  const context = taskContextInputSchema.parse(input ?? {});

  return taskContextSchema.parse({
    text: context.text?.trim() || undefined,
    attachments: context.attachments ?? [],
  });
}

function parseTaskContext(value: string): TaskContext {
  if (!value.trim()) {
    return normalizeTaskContext();
  }

  return normalizeTaskContext(JSON.parse(value));
}

function stringifyOptional(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJsonRecord(value: string | null): Record<string, unknown> | undefined {
  return value ? z.record(z.string(), z.unknown()).parse(JSON.parse(value)) : undefined;
}

function parseTaskRunArtifacts(value: string | null): TaskRunArtifact[] {
  return value ? taskRunArtifactSchema.array().parse(JSON.parse(value)) : [];
}

function parseOptional<T>(
  value: string | null,
  schema: { parse(input: unknown): T },
): T | undefined {
  return value ? schema.parse(JSON.parse(value)) : undefined;
}
