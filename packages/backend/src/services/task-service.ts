import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  createTaskInputSchema,
  createTaskRunInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskListSchema,
  taskPermissionProfileSchema,
  taskRunListSchema,
  taskRunSchema,
  taskScheduleSchema,
  taskSchema,
  taskTodoInputSchema,
  taskTodoSchema,
  updateTaskInputSchema,
  updateTaskRunInputSchema,
  type CreateTaskInput,
  type CreateTaskRunInput,
  type ListTaskRunsQuery,
  type ListTasksQuery,
  type Task,
  type TaskRun,
  type TaskRunStatus,
  type TaskSchedule,
  type TaskStatus,
  type TaskTodo,
  type UpdateTaskInput,
  type UpdateTaskRunInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import { task_runs, task_templates, tasks } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

export type TaskService = ReturnType<typeof createTaskService>;

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
      const templateRows = await options.db.query.task_templates.findMany({
        where: (table, operators) => {
          const filters = [operators.isNull(table.deleted_at)];

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

      return taskListSchema.parse(
        [...rows.map(mapTask), ...templateRows.map(mapTemplateAsTask)].sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        ),
      );
    },

    async get(id: string): Promise<Task | undefined> {
      const row = await getTaskRow(id);
      if (row) {
        return mapTask(row);
      }

      const template = await getTemplateRow(id);
      return template ? mapTemplateAsTask(template) : undefined;
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
      const todos = normalizeTodos(parsed.todos, timestamp);

      if (triggerMode !== "manual") {
        const id = createId();
        const [row] = await options.db
          .insert(task_templates)
          .values({
            id,
            agent_id: parsed.agentId,
            title: parsed.title,
            description: parsed.description,
            todos_json: JSON.stringify(todos),
            status,
            trigger_mode: triggerMode,
            schedule_json: JSON.stringify(schedule),
            permission_profile_json: stringifyOptional(parsed.permissionProfile),
            enabled,
            archived,
            latest_result_summary: null,
            latest_task_id: null,
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
          title: parsed.title,
          description: parsed.description,
          context: "",
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          trigger_source: null,
          schedule_json: JSON.stringify(schedule),
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_result_summary: null,
          scheduled_for: null,
          due_at: null,
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
          title: parsed.title,
          description: parsed.description,
          context: "",
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          trigger_source: "manual",
          schedule_json: JSON.stringify(schedule),
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_result_summary: null,
          scheduled_for: null,
          due_at: null,
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
      const existingTemplate = existing ? undefined : await getTemplateRow(id);

      if (!existing && !existingTemplate) {
        return undefined;
      }

      if (parsed.agentId) {
        await requireActiveAgent(parsed.agentId);
      }

      const timestamp = now();
      const source = existing ?? existingTemplate!;
      const triggerMode = parsed.triggerMode ?? source.trigger_mode;
      const schedule = normalizeSchedule(
        triggerMode,
        parsed.schedule ?? parseTaskSchedule(source.schedule_json),
      );
      const archived = parsed.status === "archived" ? true : source.archived;
      const enabled =
        parsed.enabled ?? (parsed.status ? parsed.status === "enabled" : source.enabled);
      const status = normalizeTaskStatus({
        requestedStatus: parsed.status,
        enabled,
        archived,
        fallbackStatus: source.status as TaskStatus,
      });
      const todos = parsed.todos
        ? normalizeTodos(parsed.todos, timestamp)
        : parseTaskTodos(source.todos_json);

      if (existingTemplate) {
        const [row] = await options.db
          .update(task_templates)
          .set({
            agent_id: parsed.agentId ?? existingTemplate.agent_id,
            title: parsed.title ?? existingTemplate.title,
            description: parsed.description ?? existingTemplate.description,
            todos_json: JSON.stringify(todos),
            status,
            trigger_mode: triggerMode,
            schedule_json: JSON.stringify(schedule),
            permission_profile_json:
              parsed.permissionProfile === undefined
                ? existingTemplate.permission_profile_json
                : stringifyOptional(parsed.permissionProfile),
            enabled,
            archived,
            updated_at: timestamp,
            archived_at: archived ? (existingTemplate.archived_at ?? timestamp) : null,
          })
          .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
          .returning();

        if (!row) {
          throw new Error("Failed to update task template record.");
        }

        return mapTemplateAsTask(row);
      }

      if (!existing) {
        throw new Error("Task row disappeared during update.");
      }

      const [row] = await options.db
        .update(tasks)
        .set({
          agent_id: parsed.agentId ?? existing.agent_id,
          title: parsed.title ?? existing.title,
          description: parsed.description ?? existing.description,
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

    async archive(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id);
      const existingTemplate = existing ? undefined : await getTemplateRow(id);

      if (!existing && !existingTemplate) {
        return undefined;
      }

      const timestamp = now();

      if (existingTemplate) {
        const [row] = await options.db
          .update(task_templates)
          .set({
            status: "archived",
            archived: true,
            updated_at: timestamp,
            archived_at: existingTemplate.archived_at ?? timestamp,
          })
          .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
          .returning();

        if (!row) {
          throw new Error("Failed to archive task template record.");
        }

        return mapTemplateAsTask(row);
      }

      if (!existing) {
        throw new Error("Task row disappeared during archive.");
      }

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

    async restore(id: string): Promise<Task | undefined> {
      const existing = await getTaskRow(id, { includeArchived: true });
      const existingTemplate = existing
        ? undefined
        : await getTemplateRow(id, { includeArchived: true });

      if (!existing && !existingTemplate) {
        return undefined;
      }

      const timestamp = now();

      if (existingTemplate) {
        const [row] = await options.db
          .update(task_templates)
          .set({
            status: existingTemplate.enabled ? "enabled" : "disabled",
            archived: false,
            updated_at: timestamp,
            archived_at: null,
          })
          .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
          .returning();

        if (!row) {
          throw new Error("Failed to restore task template record.");
        }

        return mapTemplateAsTask(row);
      }

      if (!existing) {
        throw new Error("Task row disappeared during restore.");
      }

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
        const [row] = await options.db
          .update(task_templates)
          .set({
            enabled: false,
            updated_at: timestamp,
            deleted_at: timestamp,
          })
          .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
          .returning({ id: task_templates.id });

        return row !== undefined;
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
      input: { scheduledFor?: string; triggerSource?: TaskRun["triggerSource"] } = {},
    ): Promise<Task | undefined> {
      const template = await getTemplateRow(templateId);

      if (!template) {
        return undefined;
      }

      const timestamp = now();
      const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      const [row] = await options.db
        .insert(tasks)
        .values({
          id: createId(),
          template_id: template.id,
          agent_id: template.agent_id,
          title: template.title,
          description: template.description,
          context: "",
          todos_json: template.todos_json,
          status: "enabled",
          trigger_mode: "manual",
          trigger_source: input.triggerSource ?? "scheduled",
          schedule_json: JSON.stringify({ mode: "manual" }),
          permission_profile_json: template.permission_profile_json,
          enabled: true,
          archived: false,
          latest_result_summary: null,
          scheduled_for: scheduledFor,
          due_at: scheduledFor,
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
        .set({ latest_task_id: row.id, updated_at: timestamp })
        .where(eq(task_templates.id, template.id));

      return mapTask(row);
    },

    async listTemplateTasks(templateId: string): Promise<Task[]> {
      await requireTemplate(templateId, { includeArchived: true });
      const rows = await options.db.query.tasks.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.template_id, templateId),
            operators.ne(table.id, templateId),
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

    async getActiveRunForTask(taskId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.task_id, taskId),
            operators.inArray(table.status, ["queued", "running"]),
          ),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return row ? mapTaskRun(row) : undefined;
    },

    async createRun(input: CreateTaskRunInput): Promise<TaskRun> {
      const parsed = createTaskRunInputSchema.parse(input);
      const task = await requireTask(parsed.taskId, { includeArchived: true });

      if (task.agent_id !== parsed.agentId) {
        throw new BadRequestError("Task run agent must match the task agent.");
      }

      const timestamp = now();
      const [row] = await options.db
        .insert(task_runs)
        .values({
          id: createId(),
          task_id: parsed.taskId,
          agent_id: parsed.agentId,
          opencode_session_id: parsed.opencodeSessionId ?? null,
          status: parsed.status,
          trigger_source: parsed.triggerSource,
          context_json: stringifyOptional(parsed.context),
          rendered_prompt: parsed.renderedPrompt,
          rendered_context_json: stringifyOptional(parsed.renderedContext),
          effective_permissions_json: stringifyOptional(parsed.effectivePermissions),
          result_summary: parsed.resultSummary ?? null,
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
          status: parsed.status ?? existing.status,
          context_json:
            parsed.context === undefined
              ? existing.context_json
              : stringifyOptional(parsed.context),
          rendered_prompt: parsed.renderedPrompt ?? existing.rendered_prompt,
          rendered_context_json:
            parsed.renderedContext === undefined
              ? existing.rendered_context_json
              : stringifyOptional(parsed.renderedContext),
          effective_permissions_json:
            parsed.effectivePermissions === undefined
              ? existing.effective_permissions_json
              : stringifyOptional(parsed.effectivePermissions),
          result_summary: parsed.resultSummary ?? existing.result_summary,
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
      return this.updateRun(id, { ...input, status });
    },
  };

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
    options?: { includeArchived?: boolean },
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
    getOptions?: { includeArchived?: boolean },
  ): Promise<typeof tasks.$inferSelect | undefined> {
    return options.db.query.tasks.findFirst({
      where: (table, operators) => {
        const filters = [operators.eq(table.id, id), operators.isNull(table.deleted_at)];

        const nonTemplateProxyFilter = operators.or(
          operators.isNull(table.template_id),
          operators.ne(table.template_id, id),
        );

        if (nonTemplateProxyFilter) {
          filters.push(nonTemplateProxyFilter);
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
    getOptions?: { includeArchived?: boolean },
  ): Promise<typeof task_templates.$inferSelect | undefined> {
    return options.db.query.task_templates.findFirst({
      where: (table, operators) => {
        const filters = [operators.eq(table.id, id), operators.isNull(table.deleted_at)];

        if (!getOptions?.includeArchived) {
          filters.push(operators.eq(table.archived, false));
        }

        return operators.and(...filters);
      },
    });
  }

  async function getTemplateTaskIds(templateId: string): Promise<string[]> {
    const rows = await options.db.query.tasks.findMany({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.template_id, templateId),
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

function mapTask(row: typeof tasks.$inferSelect): Task {
  return taskSchema.parse({
    id: row.id,
    templateId: row.template_id ?? undefined,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    triggerMode: row.trigger_mode,
    schedule: parseTaskSchedule(row.schedule_json),
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestResultSummary: row.latest_result_summary ?? undefined,
    scheduledFor: row.scheduled_for?.toISOString(),
    dueAt: row.due_at?.toISOString(),
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
    title: row.title,
    description: row.description,
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    triggerMode: row.trigger_mode,
    schedule: parseTaskSchedule(row.schedule_json),
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestResultSummary: row.latest_result_summary ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

function mapTaskRun(row: typeof task_runs.$inferSelect): TaskRun {
  return taskRunSchema.parse({
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    opencodeSessionId: row.opencode_session_id ?? undefined,
    status: row.status,
    triggerSource: row.trigger_source,
    renderedPrompt: row.rendered_prompt,
    context: parseJsonRecord(row.context_json),
    renderedContext: parseJsonRecord(row.rendered_context_json),
    effectivePermissions: parseOptional(
      row.effective_permissions_json,
      taskPermissionProfileSchema,
    ),
    resultSummary: row.result_summary ?? undefined,
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

function stringifyOptional(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJsonRecord(value: string | null): Record<string, unknown> | undefined {
  return value ? z.record(z.string(), z.unknown()).parse(JSON.parse(value)) : undefined;
}

function parseOptional<T>(
  value: string | null,
  schema: { parse(input: unknown): T },
): T | undefined {
  return value ? schema.parse(JSON.parse(value)) : undefined;
}
