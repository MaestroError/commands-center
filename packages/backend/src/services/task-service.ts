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
import { task_runs, tasks } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

export type TaskService = ReturnType<typeof createTaskService>;

export function createTaskService(options: { db: AppDb; config: RuntimeConfig }) {
  return {
    async list(query: Partial<ListTasksQuery> = {}): Promise<Task[]> {
      const parsed = listTasksQuerySchema.parse(query);
      const rows = await options.db.query.tasks.findMany({
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

      return taskListSchema.parse(rows.map(mapTask));
    },

    async get(id: string): Promise<Task | undefined> {
      const row = await getTaskRow(id);
      return row ? mapTask(row) : undefined;
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

      const [row] = await options.db
        .insert(tasks)
        .values({
          id: createId(),
          agent_id: parsed.agentId,
          title: parsed.title,
          description: parsed.description,
          context: parsed.context,
          todos_json: JSON.stringify(todos),
          status,
          trigger_mode: triggerMode,
          schedule_json: JSON.stringify(schedule),
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_result_summary: null,
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

    async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
      const parsed = updateTaskInputSchema.parse(input);
      const existing = await getTaskRow(id);

      if (!existing) {
        return undefined;
      }

      if (parsed.agentId) {
        await requireActiveAgent(parsed.agentId);
      }

      const timestamp = now();
      const triggerMode = parsed.triggerMode ?? existing.trigger_mode;
      const schedule = normalizeSchedule(
        triggerMode,
        parsed.schedule ?? parseTaskSchedule(existing.schedule_json),
      );
      const archived = parsed.status === "archived" ? true : existing.archived;
      const enabled =
        parsed.enabled ?? (parsed.status ? parsed.status === "enabled" : existing.enabled);
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
          title: parsed.title ?? existing.title,
          description: parsed.description ?? existing.description,
          context: parsed.context ?? existing.context,
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

    async enable(id: string): Promise<Task | undefined> {
      return setEnabled(id, true);
    },

    async disable(id: string): Promise<Task | undefined> {
      return setEnabled(id, false);
    },

    async delete(id: string): Promise<boolean> {
      const existing = await getTaskRow(id, { includeArchived: true });

      if (!existing) {
        return false;
      }

      const timestamp = now();
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

    async listRuns(taskId: string, query: Partial<ListTaskRunsQuery> = {}): Promise<TaskRun[]> {
      await requireTask(taskId, { includeArchived: true });
      const parsed = listTaskRunsQuerySchema.parse(query);
      const rows = await options.db.query.task_runs.findMany({
        where: (table, operators) => {
          const filters = [operators.eq(table.task_id, taskId)];

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
      await requireTask(taskId, { includeArchived: true });
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) =>
          operators.and(operators.eq(table.task_id, taskId), operators.eq(table.id, runId)),
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

    if (!existing) {
      return undefined;
    }

    if (existing.archived) {
      throw new BadRequestError("Archived tasks cannot be enabled or disabled.");
    }

    const timestamp = now();
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

  async function getTaskRow(
    id: string,
    getOptions?: { includeArchived?: boolean },
  ): Promise<typeof tasks.$inferSelect | undefined> {
    return options.db.query.tasks.findFirst({
      where: (table, operators) => {
        const filters = [operators.eq(table.id, id), operators.isNull(table.deleted_at)];

        if (!getOptions?.includeArchived) {
          filters.push(operators.eq(table.archived, false));
        }

        return operators.and(...filters);
      },
    });
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
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    context: row.context,
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
