import { readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { and, count, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";

import {
  createTaskInputSchema,
  appendTaskContextInputSchema,
  createTaskTemplateInputSchema,
  createTaskRunInputSchema,
  addTaskRunArtifactInputSchema,
  fallbackModelsSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  markTaskRunNeedsReviewInputSchema,
  MAX_FALLBACK_MODELS,
  queueTaskInputSchema,
  recurringTaskScheduleSchema,
  reviewQuestionSchema,
  setTaskRunResultInputSchema,
  createTaskFeedbackInputSchema,
  createTaskRunFollowupInputSchema,
  taskFeedbackThreadListSchema,
  taskFeedbackThreadSchema,
  taskContextInputSchema,
  taskContextSchema,
  taskListSchema,
  taskPermissionProfileSchema,
  persistedTaskRunArtifactSchema,
  taskRunFollowupSchema,
  taskRunListSchema,
  taskRunSchema,
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
  updateTaskFeedbackInputSchema,
  updateTaskTemplateInputSchema,
  updateTaskRunInputSchema,
  updateTaskSubtaskInputSchema,
  type AppendTaskContextInput,
  type CreateTaskTemplateInput,
  type CreateTaskRunInput,
  type ListTaskRunsQuery,
  type ListTasksQuery,
  type Task,
  type TaskContext,
  type TaskFeedbackThread,
  type TaskRunArtifact,
  type TaskRunFollowup,
  type TaskRun,
  type TaskRunStatus,
  type TaskSubtask,
  type TaskSubtaskDerivedStatus,
  type TaskSubtaskProgress,
  type TaskTemplate,
  type TaskStatus,
  type TaskTodo,
  type UpdateTaskTemplateInput,
  type UpdateTaskRunInput,
  type UpdateTaskSubtaskInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import {
  task_feedback,
  task_run_followups,
  task_runs,
  task_scheduler_state,
  task_subtasks,
  task_templates,
  tasks,
} from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { computeNextRecurringRun } from "./task-scheduler-service.js";

// ---------------------------------------------------------------------------
// Task template file schema  (configuration/task-templates/<id>.json)
// ---------------------------------------------------------------------------

const taskTemplateFileSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  defaultAgentId: z.string(),
  model: z.string().nullable().optional(),
  fallbackModels: fallbackModelsSchema,
  title: z.string(),
  description: z.string(),
  todos: z.array(taskTodoSchema),
  recurrence: recurringTaskScheduleSchema.nullable(),
  permissionProfile: taskPermissionProfileSchema.nullable(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

type TemplateFileContent = z.infer<typeof taskTemplateFileSchema>;

function templateFilePath(config: RuntimeConfig, id: string): string {
  return resolve(config.paths.subdirectories.configuration, "task-templates", `${id}.json`);
}

async function writeTemplateFile(
  config: RuntimeConfig,
  content: Omit<TemplateFileContent, "version">,
): Promise<void> {
  await writeConfigFileAtomic(templateFilePath(config, content.id), { version: 1, ...content });
}

async function deleteTemplateFile(config: RuntimeConfig, id: string): Promise<void> {
  try {
    await unlink(templateFilePath(config, id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ---------------------------------------------------------------------------
// Task template boot reconciler
// ---------------------------------------------------------------------------

export const taskTemplateReconciler: WorkspaceReconciler = {
  name: "task-templates",

  async reconcile({ config, db, logger }) {
    const dir = resolve(config.paths.subdirectories.configuration, "task-templates");

    let filenames: string[];
    try {
      filenames = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    const fileIds = new Set<string>();

    for (const filename of filenames.filter((f) => f.endsWith(".json"))) {
      const path = resolve(dir, filename);
      const data = await readConfigFile(path, taskTemplateFileSchema, logger);
      if (!data) continue;

      fileIds.add(data.id);

      const enabled = data.enabled;
      const recurrence = data.recurrence;
      const timestamp = now();
      const payload = {
        agent_id: data.defaultAgentId,
        default_agent_id: data.defaultAgentId,
        model: data.model ?? null,
        fallback_models: JSON.stringify(data.fallbackModels),
        title: data.title,
        description: data.description,
        todos_json: JSON.stringify(data.todos),
        status: enabled ? ("enabled" as const) : ("disabled" as const),
        recurrence_json: recurrence ? JSON.stringify(recurrence) : null,
        permission_profile_json: data.permissionProfile
          ? JSON.stringify(data.permissionProfile)
          : null,
        enabled,
        archived: false,
        next_occurrence_at: readTemplateNextOccurrenceAt(recurrence, enabled, timestamp),
        updated_at: new Date(data.updatedAt),
      };

      const existing = await db.query.task_templates.findFirst({
        where: (t, { eq }) => eq(t.id, data.id),
      });

      if (existing) {
        await db.update(task_templates).set(payload).where(eq(task_templates.id, data.id));
      } else {
        await db.insert(task_templates).values({
          id: data.id,
          ...payload,
          latest_final_message: null,
          latest_task_id: null,
          last_generated_occurrence_at: null,
          created_at: new Date(data.createdAt),
          archived_at: null,
          deleted_at: null,
        });
      }
    }

    // Delete DB rows with no corresponding file (orphans and soft-deleted rows
    // whose files were already removed).
    const rows = await db
      .select({ id: task_templates.id })
      .from(task_templates)
      .where(isNull(task_templates.deleted_at));

    for (const row of rows) {
      if (!fileIds.has(row.id)) {
        await db.delete(task_templates).where(eq(task_templates.id, row.id));
      }
    }
  },
};

export type TaskService = ReturnType<typeof createTaskService>;

const fallbackModelsOverrideSchema = z.array(z.string().trim().min(1)).max(MAX_FALLBACK_MODELS);
const queueTaskOptionsSchema = queueTaskInputSchema.extend({
  id: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  fallbackModels: fallbackModelsOverrideSchema.optional(),
  retryOfRunId: z.string().trim().min(1).optional(),
  context: taskContextSchema.optional(),
  renderedPrompt: z.string().optional(),
  renderedContext: z.record(z.string(), z.unknown()).optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
});
type QueueTaskOptions = z.input<typeof queueTaskOptionsSchema>;

type CreateTaskFromTemplateInput = {
  occurrenceAt?: string;
  scheduledFor?: string;
  triggerSource?: TaskRun["triggerSource"];
  generatedByAgentId?: string;
  context?: TaskContext;
  // Disabled templates are inert for automation (scheduler, API, agent triggers).
  // Human UI entry points pass `true` to allow an explicit manual override.
  allowDisabled?: boolean;
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
      return this.list({ includeArchived: true, status: "archived" });
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

    async createTemplate(input: CreateTaskTemplateInput): Promise<TaskTemplate> {
      const parsed = createTaskTemplateInputSchema.parse(input);
      await requireActiveAgent(parsed.defaultAgentId);
      await enforceTaskLimit();

      const id = createId();
      const timestamp = now();
      const todos = normalizeTodos(parsed.todos, timestamp);
      const enabled = parsed.enabled ?? true;
      const fallbackModels = normalizeFallbackModels(
        parsed.fallbackModels,
        parsed.model ?? undefined,
      );
      const recurrence = parsed.recurrence ?? null;

      // File-first: persist to configuration/task-templates/<id>.json.
      await writeTemplateFile(options.config, {
        id,
        defaultAgentId: parsed.defaultAgentId,
        model: parsed.model ?? null,
        fallbackModels,
        title: parsed.title,
        description: parsed.description,
        todos,
        recurrence,
        permissionProfile: parsed.permissionProfile ?? null,
        enabled,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      });

      const [row] = await options.db
        .insert(task_templates)
        .values({
          id,
          agent_id: parsed.defaultAgentId,
          default_agent_id: parsed.defaultAgentId,
          model: parsed.model ?? null,
          fallback_models: JSON.stringify(fallbackModels),
          title: parsed.title,
          description: parsed.description,
          todos_json: JSON.stringify(todos),
          status: enabled ? "enabled" : "disabled",
          recurrence_json: recurrence ? JSON.stringify(recurrence) : null,
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived: false,
          latest_final_message: null,
          latest_task_id: null,
          next_occurrence_at: readTemplateNextOccurrenceAt(recurrence, enabled, timestamp),
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

    async updateTemplate(
      id: string,
      input: UpdateTaskTemplateInput,
    ): Promise<TaskTemplate | undefined> {
      const parsed = updateTaskTemplateInputSchema.parse(input);
      const existing = await getTemplateRow(id);

      if (!existing) {
        return undefined;
      }

      if (parsed.defaultAgentId) {
        await requireActiveAgent(parsed.defaultAgentId);
      }

      const timestamp = now();
      const todos = parsed.todos
        ? normalizeTodos(parsed.todos, timestamp)
        : parseTaskTodos(existing.todos_json);
      const recurrence =
        parsed.recurrence === undefined
          ? existing.recurrence_json
            ? recurringTaskScheduleSchema.parse(JSON.parse(existing.recurrence_json))
            : null
          : (parsed.recurrence ?? null);
      const resetSchedulerState =
        parsed.recurrence !== undefined ||
        (parsed.enabled !== undefined && parsed.enabled !== existing.enabled);
      const nextOccurrenceAt =
        parsed.recurrence === undefined
          ? resetSchedulerState
            ? readTemplateNextOccurrenceAt(
                recurrence,
                parsed.enabled ?? existing.enabled,
                timestamp,
              )
            : existing.next_occurrence_at
          : readTemplateNextOccurrenceAt(recurrence, parsed.enabled ?? existing.enabled, timestamp);
      const enabled = parsed.enabled ?? existing.enabled;
      const defaultAgentId =
        parsed.defaultAgentId ?? existing.default_agent_id ?? existing.agent_id;
      const model = parsed.model === undefined ? existing.model : (parsed.model ?? null);
      const fallbackModels = normalizeFallbackModels(
        parsed.fallbackModels ?? parseFallbackModels(existing.fallback_models),
        model ?? undefined,
      );

      // File-first: update configuration/task-templates/<id>.json.
      await writeTemplateFile(options.config, {
        id,
        defaultAgentId,
        model,
        fallbackModels,
        title: parsed.title ?? existing.title,
        description: parsed.description ?? existing.description,
        todos,
        recurrence,
        permissionProfile:
          parsed.permissionProfile === undefined
            ? (parseOptional(existing.permission_profile_json, taskPermissionProfileSchema) ?? null)
            : (parsed.permissionProfile ?? null),
        enabled,
        createdAt: existing.created_at.toISOString(),
        updatedAt: timestamp.toISOString(),
      });

      const [row] = await options.db
        .update(task_templates)
        .set({
          agent_id: defaultAgentId,
          default_agent_id: defaultAgentId,
          model,
          fallback_models: JSON.stringify(fallbackModels),
          title: parsed.title ?? existing.title,
          description: parsed.description ?? existing.description,
          todos_json: JSON.stringify(todos),
          status: enabled ? "enabled" : "disabled",
          recurrence_json: recurrence ? JSON.stringify(recurrence) : null,
          permission_profile_json:
            parsed.permissionProfile === undefined
              ? existing.permission_profile_json
              : stringifyOptional(parsed.permissionProfile),
          enabled,
          next_occurrence_at: nextOccurrenceAt,
          updated_at: timestamp,
        })
        .where(and(eq(task_templates.id, id), isNull(task_templates.deleted_at)))
        .returning();

      if (!row) {
        throw new Error("Failed to update task template record.");
      }

      if (resetSchedulerState) {
        await resetTemplateSchedulerState(id);
      }

      return mapTaskTemplate(row);
    },

    async enableTemplate(id: string): Promise<TaskTemplate | undefined> {
      return this.updateTemplate(id, { enabled: true });
    },

    async disableTemplate(id: string): Promise<TaskTemplate | undefined> {
      return this.updateTemplate(id, { enabled: false });
    },

    async create(input: unknown): Promise<Task> {
      const parsed = createTaskInputSchema.parse(input);
      await requireActiveAgent(parsed.agentId);
      await enforceTaskLimit();

      const timestamp = now();
      const enabled = parsed.enabled ?? parsed.status !== "draft";
      const archived = parsed.status === "archived";
      const status = normalizeTaskStatus({
        requestedStatus: parsed.status,
        enabled,
        archived,
        scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : undefined,
      });
      const defaultAgentId = parsed.defaultAgentId ?? parsed.agentId;
      const todos = normalizeTodos(parsed.todos, timestamp);
      const context = normalizeTaskContext(parsed.context);
      const fallbackModels = normalizeFallbackModels(
        parsed.fallbackModels,
        parsed.model ?? undefined,
      );

      if (parsed.defaultAgentId) {
        await requireActiveAgent(parsed.defaultAgentId);
      }

      const [row] = await options.db
        .insert(tasks)
        .values({
          id: createId(),
          template_id: null,
          agent_id: parsed.agentId,
          default_agent_id: defaultAgentId,
          model: parsed.model ?? null,
          fallback_models: JSON.stringify(fallbackModels),
          title: parsed.title,
          description: parsed.description,
          context: JSON.stringify(context),
          todos_json: JSON.stringify(todos),
          status,
          trigger_source: parsed.triggerSource ?? "manual",
          permission_profile_json: stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          latest_final_message: null,
          latest_run_id: null,
          source_template_id: null,
          generated_by_agent_id: null,
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

      if (existing) {
        const task = mapTask(existing);

        return this.create({
          agentId: task.agentId,
          defaultAgentId: task.defaultAgentId,
          model: task.model,
          fallbackModels: task.fallbackModels,
          title: `${task.title} copy`,
          description: task.description,
          context: task.context,
          todos: task.todos.map((todo) => ({
            content: todo.content,
            status: todo.status,
          })),
          permissionProfile: task.permissionProfile,
          enabled: false,
        });
      }

      if (!existingTemplate) {
        return undefined;
      }

      const task = mapTemplateAsTask(existingTemplate);

      return this.create({
        agentId: task.agentId,
        defaultAgentId: task.defaultAgentId,
        model: task.model,
        fallbackModels: task.fallbackModels,
        title: `${task.title} copy`,
        description: task.description,
        context: task.context,
        todos: task.todos.map((todo) => ({
          content: todo.content,
          status: todo.status,
        })),
        permissionProfile: task.permissionProfile,
        enabled: false,
      });
    },

    async update(id: string, input: unknown): Promise<Task | undefined> {
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
        scheduledAt:
          parsed.scheduledAt === undefined
            ? existing.scheduled_at
            : parsed.scheduledAt
              ? new Date(parsed.scheduledAt)
              : null,
      });
      const todos = parsed.todos
        ? normalizeTodos(parsed.todos, timestamp)
        : parseTaskTodos(existing.todos_json);
      const model = parsed.model === undefined ? existing.model : (parsed.model ?? null);
      const fallbackModels = normalizeFallbackModels(
        parsed.fallbackModels ?? parseFallbackModels(existing.fallback_models),
        model ?? undefined,
      );

      const [row] = await options.db
        .update(tasks)
        .set({
          agent_id: parsed.agentId ?? existing.agent_id,
          default_agent_id: parsed.defaultAgentId ?? existing.default_agent_id,
          model,
          fallback_models: JSON.stringify(fallbackModels),
          title: parsed.title ?? existing.title,
          description: parsed.description ?? existing.description,
          context:
            parsed.context === undefined
              ? existing.context
              : JSON.stringify(normalizeTaskContext(parsed.context)),
          todos_json: JSON.stringify(todos),
          status,
          permission_profile_json:
            parsed.permissionProfile === undefined
              ? existing.permission_profile_json
              : stringifyOptional(parsed.permissionProfile),
          enabled,
          archived,
          scheduled_at:
            parsed.scheduledAt === undefined
              ? existing.scheduled_at
              : parsed.scheduledAt
                ? new Date(parsed.scheduledAt)
                : null,
          due_at:
            parsed.dueAt === undefined
              ? existing.due_at
              : parsed.dueAt
                ? new Date(parsed.dueAt)
                : null,
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
          status: existing.enabled ? (existing.scheduled_at ? "scheduled" : "backlog") : "disabled",
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

    async updateFeedback(taskId: string, feedbackId: string, input: unknown) {
      await requireTask(taskId, { includeArchived: true });
      const parsed = updateTaskFeedbackInputSchema.parse(input);
      const feedback = await options.db.query.task_feedback.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.id, feedbackId),
            operators.eq(table.task_id, taskId),
            operators.isNull(table.deleted_at),
          ),
      });

      if (!feedback) {
        return undefined;
      }

      const subtasks = await options.db.query.task_subtasks.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.feedback_id, feedbackId),
            operators.isNull(table.deleted_at),
          ),
      });
      const subtaskIds = subtasks.map((subtask) => subtask.id);

      if (subtaskIds.length > 0) {
        const existingRun = await options.db.query.task_runs.findFirst({
          where: (table, operators) => operators.inArray(table.subtask_id, subtaskIds),
        });

        if (existingRun) {
          throw new ConflictError("Feedback cannot be edited after a subtask run has started.");
        }
      }

      const timestamp = now();
      options.db.transaction((tx) => {
        tx.update(task_feedback)
          .set({
            body: parsed.body,
            updated_at: timestamp,
          })
          .where(eq(task_feedback.id, feedbackId))
          .run();

        if (subtaskIds.length > 0) {
          tx.update(task_subtasks)
            .set({
              description: parsed.body,
              updated_at: timestamp,
            })
            .where(and(eq(task_subtasks.feedback_id, feedbackId), isNull(task_subtasks.deleted_at)))
            .run();
        }
      });

      const threads = await this.listFeedback(taskId);
      return threads.find((thread) => thread.id === feedbackId);
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

    async insertFollowup(run: TaskRun, input: unknown): Promise<TaskRunFollowup> {
      const parsed = createTaskRunFollowupInputSchema.parse(input);
      const timestamp = now();
      const [row] = await options.db
        .insert(task_run_followups)
        .values({
          id: createId(),
          task_id: run.taskId,
          run_id: run.id,
          kind: parsed.kind,
          status: "sending",
          body: parsed.body,
          answer_body: null,
          answered_at: null,
          error_message: null,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create task run reply record.");
      }

      return mapTaskRunFollowup(row);
    },

    async markFollowupAnswered(
      followupId: string,
      input: { answerBody?: string; answeredAt: string },
    ): Promise<TaskRunFollowup | undefined> {
      const answeredAtDate = new Date(z.string().datetime().parse(input.answeredAt));
      const [row] = await options.db
        .update(task_run_followups)
        .set({
          status: "answered",
          answer_body: input.answerBody ?? null,
          answered_at: answeredAtDate,
          error_message: null,
          updated_at: now(),
        })
        .where(and(eq(task_run_followups.id, followupId), eq(task_run_followups.status, "sending")))
        .returning();

      return row ? mapTaskRunFollowup(row) : undefined;
    },

    async markFollowupFailed(
      followupId: string,
      errorMessage: string,
    ): Promise<TaskRunFollowup | undefined> {
      const [row] = await options.db
        .update(task_run_followups)
        .set({
          status: "failed",
          error_message: errorMessage,
          updated_at: now(),
        })
        .where(and(eq(task_run_followups.id, followupId), eq(task_run_followups.status, "sending")))
        .returning();

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
        // File-first: remove configuration/task-templates/<id>.json before soft-delete.
        await deleteTemplateFile(options.config, id);

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

      if (!template.enabled && !input.allowDisabled) {
        throw new Error("Task template is disabled.");
      }

      const row = options.db.transaction((tx) => {
        const timestamp = now();
        const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
        const occurrenceAt = input.occurrenceAt
          ? new Date(input.occurrenceAt)
          : (scheduledFor ?? timestamp);
        const existing = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.source_template_id, template.id),
              eq(tasks.source_occurrence_at, occurrenceAt),
              isNull(tasks.deleted_at),
            ),
          )
          .get();

        if (existing) {
          return existing;
        }

        const triggerSource = input.triggerSource ?? "scheduled";
        const generatedTitle = `${template.title} #${taskGenerationSourceLetter(triggerSource)}${
          countGeneratedTasksForTemplate(tx, template.id) + 1
        }`;

        const inserted = tx
          .insert(tasks)
          .values({
            id: createId(),
            template_id: null,
            agent_id: template.agent_id,
            default_agent_id: template.default_agent_id,
            model: template.model,
            fallback_models: template.fallback_models,
            title: generatedTitle,
            description: template.description,
            context: JSON.stringify(normalizeTaskContext(input.context)),
            todos_json: template.todos_json,
            status: scheduledFor ? "scheduled" : "backlog",
            trigger_source: triggerSource,
            permission_profile_json: template.permission_profile_json,
            enabled: true,
            archived: false,
            latest_final_message: null,
            latest_run_id: null,
            source_template_id: template.id,
            generated_by_agent_id: input.generatedByAgentId ?? null,
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
          .returning()
          .get();

        if (!inserted) {
          throw new Error("Failed to create task occurrence record.");
        }

        tx.update(task_templates)
          .set({
            latest_task_id: inserted.id,
            last_generated_occurrence_at: occurrenceAt,
            updated_at: timestamp,
          })
          .where(eq(task_templates.id, template.id))
          .run();

        return inserted;
      });

      if (!row) {
        throw new Error("Failed to create task occurrence record.");
      }

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

      return taskRunListSchema.parse(await mapTaskRunsWithReplyState(options.db, rows));
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

      return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
    },

    async getRunById(runId: string): Promise<TaskRun | undefined> {
      const row = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, runId),
      });

      return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      const rows = await options.db.query.task_runs.findMany({
        where: (table, operators) => operators.inArray(table.status, ["queued", "running"]),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return taskRunListSchema.parse(await mapTaskRunsWithReplyState(options.db, rows));
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

      return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
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

      return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
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

      return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
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

        return row ? mapTaskRunWithReplyState(options.db, row) : undefined;
      } catch (error) {
        if (isRunningAgentConstraintError(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async queueTask(input: QueueTaskOptions): Promise<TaskRun> {
      const parsed = queueTaskOptionsSchema.parse(input);
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
        id: parsed.id,
        taskId: task.id,
        subtaskId: parsed.subtaskId,
        agentId: parsed.agentId ?? subtask?.agent_id ?? task.default_agent_id ?? task.agent_id,
        model: parsed.model ?? task.model ?? undefined,
        fallbackModels: normalizeFallbackModels(
          parsed.fallbackModels ?? parseFallbackModels(task.fallback_models),
          parsed.model ?? task.model ?? undefined,
        ),
        retryOfRunId: parsed.retryOfRunId,
        status: "queued",
        triggerSource: parsed.triggerSource,
        context: parsed.context,
        triggerMetadata: parsed.metadata,
        renderedPrompt: parsed.renderedPrompt ?? "",
        renderedContext: parsed.renderedContext,
        effectivePermissions: parsed.effectivePermissions,
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
          model: parsed.model ?? null,
          fallback_models: JSON.stringify(
            normalizeFallbackModels(parsed.fallbackModels, parsed.model ?? undefined),
          ),
          retry_of_run_id: parsed.retryOfRunId ?? null,
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

      return mapTaskRunWithReplyState(options.db, row);
    },

    async updateRun(id: string, input: UpdateTaskRunInput): Promise<TaskRun | undefined> {
      const parsed = updateTaskRunInputSchema.parse(input);
      const existing = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      // Freeze the run's outcome comment the first time it goes terminal with
      // content, so later reactivation (e.g. answering a reply) can keep
      // rewriting final_message/result_text without retroactively changing
      // what the Feedback timeline already showed as this run's comment.
      const mergedStatus = parsed.status ?? existing.status;
      const isTerminalStatus = mergedStatus !== "queued" && mergedStatus !== "running";
      const mergedOutcomeText =
        parsed.resultText ??
        existing.result_text ??
        parsed.finalMessage ??
        existing.final_message ??
        parsed.errorMessage ??
        existing.error_message;
      const shouldFreezeOutcome =
        isTerminalStatus && Boolean(mergedOutcomeText) && !existing.initial_outcome_text;

      const [row] = await options.db
        .update(task_runs)
        .set({
          opencode_session_id: parsed.opencodeSessionId ?? existing.opencode_session_id,
          subtask_id: parsed.subtaskId ?? existing.subtask_id,
          fallback_models:
            parsed.fallbackModels === undefined
              ? existing.fallback_models
              : JSON.stringify(normalizeFallbackModels(parsed.fallbackModels)),
          retry_of_run_id: parsed.retryOfRunId ?? existing.retry_of_run_id,
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
          initial_outcome_text: shouldFreezeOutcome
            ? mergedOutcomeText
            : existing.initial_outcome_text,
          initial_outcome_at: shouldFreezeOutcome
            ? parsed.completedAt
              ? new Date(parsed.completedAt)
              : (existing.completed_at ?? now())
            : existing.initial_outcome_at,
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

      return mapTaskRunWithReplyState(options.db, row);
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
      question?: string,
      suggestedReplies?: string[],
    ): Promise<TaskRun> {
      const parsed = markTaskRunNeedsReviewInputSchema.parse({
        taskRunId,
        reason,
        question,
        suggestedReplies,
      });
      await requireWritableRun(parsed.taskRunId, agentId);
      const reviewQuestion = parsed.question
        ? reviewQuestionSchema.parse({
            question: parsed.question,
            suggestedReplies: parsed.suggestedReplies,
          })
        : undefined;
      const [updated] = await options.db
        .update(task_runs)
        .set({
          needs_human_review: true,
          human_review_reason: parsed.reason ?? null,
          review_question_json: reviewQuestion ? JSON.stringify(reviewQuestion) : null,
          updated_at: now(),
        })
        .where(eq(task_runs.id, parsed.taskRunId))
        .returning();

      if (!updated) {
        throw new NotFoundError("Task run not found.");
      }

      return mapTaskRunWithReplyState(options.db, updated);
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

  async function requireTaskRun(taskRunId: string): Promise<typeof task_runs.$inferSelect> {
    const run = await options.db.query.task_runs.findFirst({
      where: (table, operators) => operators.eq(table.id, taskRunId),
    });

    if (!run) {
      throw new NotFoundError("Task run not found.");
    }

    return run;
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
        // Always track the latest run's explicit result (clearing a stale value
        // from a previous run when this run set none).
        latest_result_text: run.resultText ?? null,
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

    // System failures take precedence (they block acceptance and may auto-retry);
    // an intentional human-review hand-off is reported only when nothing failed.
    if (subtaskIds.some((subtaskId) => hasErroredSubtaskRun(subtaskId, runs))) {
      return "failed";
    }

    if (subtaskIds.some((subtaskId) => hasReviewSubtaskRun(subtaskId, runs))) {
      return "review";
    }

    return "ready_to_check";
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
      // File-first: update enabled flag in configuration/task-templates/<id>.json.
      await writeTemplateFile(options.config, {
        id,
        defaultAgentId: existingTemplate.default_agent_id ?? existingTemplate.agent_id,
        model: existingTemplate.model,
        fallbackModels: parseFallbackModels(existingTemplate.fallback_models),
        title: existingTemplate.title,
        description: existingTemplate.description,
        todos: parseTaskTodos(existingTemplate.todos_json),
        recurrence: existingTemplate.recurrence_json
          ? recurringTaskScheduleSchema.parse(JSON.parse(existingTemplate.recurrence_json))
          : null,
        permissionProfile:
          parseOptional(existingTemplate.permission_profile_json, taskPermissionProfileSchema) ??
          null,
        enabled,
        createdAt: existingTemplate.created_at.toISOString(),
        updatedAt: timestamp.toISOString(),
      });

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

    if (!existing) {
      return undefined;
    }

    const [row] = await options.db
      .update(tasks)
      .set({
        enabled,
        status: enabled
          ? normalizeTaskStatus({
              enabled,
              archived: existing.archived,
              fallbackStatus: existing.status as TaskStatus,
              scheduledAt: existing.scheduled_at,
            })
          : "disabled",
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

  async function resetTemplateSchedulerState(templateId: string): Promise<void> {
    await options.db
      .delete(task_scheduler_state)
      .where(eq(task_scheduler_state.task_id, templateId));
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

  function countGeneratedTasksForTemplate(db: Pick<AppDb, "select">, templateId: string): number {
    const row = db
      .select({ value: count() })
      .from(tasks)
      .where(generatedTasksForTemplateFilter(templateId))
      .get();

    return row?.value ?? 0;
  }
}

function generatedTasksForTemplateFilter(templateId: string) {
  return and(
    or(
      and(eq(tasks.template_id, templateId), ne(tasks.id, templateId)),
      eq(tasks.source_template_id, templateId),
    ),
    isNull(tasks.deleted_at),
  );
}

function readTemplateNextOccurrenceAt(
  recurrence: TaskTemplate["recurrence"] | null | undefined,
  enabled: boolean,
  timestamp: Date,
): Date | null {
  if (!recurrence) {
    return null;
  }

  return enabled
    ? computeNextRecurringRun(recurrence, timestamp, timestamp)
    : new Date(recurrence.anchorAt);
}

function taskGenerationSourceLetter(triggerSource: TaskRun["triggerSource"]): string {
  if (triggerSource === "manual") return "M";
  if (triggerSource === "api") return "A";
  if (triggerSource === "scheduled" || triggerSource === "template") return "S";
  if (triggerSource === "agent") return "G";
  return "Y";
}

function normalizeTaskStatus(input: {
  requestedStatus?: TaskStatus;
  enabled: boolean;
  archived: boolean;
  fallbackStatus?: TaskStatus;
  scheduledAt?: Date | null;
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

  if (input.scheduledAt) {
    return "scheduled";
  }

  if (input.scheduledAt === null && input.fallbackStatus === "scheduled") {
    return "backlog";
  }

  if (input.fallbackStatus && !["archived", "disabled", "draft"].includes(input.fallbackStatus)) {
    return input.fallbackStatus;
  }

  return "backlog";
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
  // A human-review request always wins: it is an explicit "a human must look"
  // signal and must never be auto-retried, even when the run also errored (e.g. a
  // task run blocked on a permission/question it cannot answer automatically).
  if (run.outcome === "needs_human_review" || run.needsHumanReview) {
    return "review";
  }

  // Otherwise system-defined failures land in `failed` (where they can auto-retry
  // up to a cap), and successful completions are ready for acceptance.
  if (run.status === "failed" || run.status === "error" || run.status === "cancelled") {
    return "failed";
  }

  if (run.status !== "completed") {
    return undefined;
  }

  if (run.outcome === "failed") {
    return "failed";
  }

  return "ready_to_check";
}

function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}

// `runs` is ordered by created_at desc, so the first match is the latest run.
// Only the latest run decides the subtask outcome: a successful fallback retry
// must clear a transient model/provider error from an earlier attempt.
function latestSubtaskRun(subtaskId: string, runs: TaskRun[]): TaskRun | undefined {
  return runs.find((run) => run.subtaskId === subtaskId);
}

// An intentional human-review hand-off, set only by the specialist or the user
// (or the system when a run blocks on input a human must resolve). This is
// terminal and must never trigger an automatic retry.
function hasReviewSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest) {
    return false;
  }

  return latest.outcome === "needs_human_review" || latest.needsHumanReview;
}

// A system-defined failure: the run errored, failed, or was cancelled, or the
// agent explicitly reported a `failed` outcome. A human-review hand-off always
// takes precedence, so a run flagged for review is never counted as a failure.
function hasErroredSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest || hasReviewSubtaskRun(subtaskId, runs)) {
    return false;
  }

  return (
    latest.status === "failed" ||
    latest.status === "error" ||
    latest.status === "cancelled" ||
    latest.outcome === "failed"
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
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    title: row.title,
    description: row.description,
    context: parseTaskContext(row.context),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestFinalMessage: row.latest_final_message ?? undefined,
    latestResultText: row.latest_result_text ?? undefined,
    latestRunId: row.latest_run_id ?? undefined,
    sourceTemplateId: row.source_template_id ?? undefined,
    generatedByAgentId: row.generated_by_agent_id ?? undefined,
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
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    title: row.title,
    description: row.description,
    context: normalizeTaskContext(),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
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
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
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

  // A human-review hand-off wins over a failure classification (e.g. a run that
  // errored because it blocked on a permission/question a human must resolve).
  if (run.outcome === "needs_human_review" || run.needsHumanReview) {
    return "review";
  }

  // System-defined failure (errored/failed/cancelled run, or a `failed` outcome).
  if (
    run.status === "failed" ||
    run.status === "error" ||
    run.status === "cancelled" ||
    run.outcome === "failed"
  ) {
    return "failed";
  }

  if (run.status === "completed") {
    return "done";
  }

  return "backlog";
}

function mapTaskRun(row: typeof task_runs.$inferSelect): TaskRun {
  const triggerMetadata = parseJsonRecord(row.trigger_metadata_json);
  return taskRunSchema.parse({
    id: row.id,
    taskId: row.task_id,
    subtaskId: row.subtask_id ?? undefined,
    agentId: row.agent_id,
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    retryOfRunId: row.retry_of_run_id ?? undefined,
    opencodeSessionId: row.opencode_session_id ?? undefined,
    status: row.status,
    runtimeState: deriveTaskRunRuntimeState(row.status, triggerMetadata),
    triggerSource: row.trigger_source,
    outcome: row.outcome ?? undefined,
    renderedPrompt: row.rendered_prompt,
    context: parseJsonRecord(row.context_json),
    triggerMetadata,
    renderedContext: parseJsonRecord(row.rendered_context_json),
    effectivePermissions: parseOptional(
      row.effective_permissions_json,
      taskPermissionProfileSchema,
    ),
    finalMessage: row.final_message ?? undefined,
    resultText: row.result_text ?? undefined,
    initialOutcomeText: row.initial_outcome_text ?? undefined,
    initialOutcomeAt: row.initial_outcome_at?.toISOString(),
    artifacts: parseTaskRunArtifacts(row.artifacts_json),
    needsHumanReview: row.needs_human_review ?? false,
    humanReviewReason: row.human_review_reason ?? undefined,
    reviewQuestion: parseOptional(row.review_question_json, reviewQuestionSchema),
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

function mapTaskRunFollowup(row: typeof task_run_followups.$inferSelect): TaskRunFollowup {
  return taskRunFollowupSchema.parse({
    id: row.id,
    taskId: row.task_id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    answerBody: row.answer_body ?? undefined,
    answeredAt: row.answered_at?.toISOString(),
    errorMessage: row.error_message ?? undefined,
  });
}

async function mapTaskRunWithReplyState(
  db: AppDb,
  row: typeof task_runs.$inferSelect,
): Promise<TaskRun> {
  const [run] = await mapTaskRunsWithReplyState(db, [row]);
  return run ?? mapTaskRun(row);
}

async function mapTaskRunsWithReplyState(
  db: AppDb,
  rows: Array<typeof task_runs.$inferSelect>,
): Promise<TaskRun[]> {
  const runs = rows.map(mapTaskRun);
  if (runs.length === 0) {
    return runs;
  }

  const activeReplyRunIds = await getActiveReplyRunIds(
    db,
    runs.map((run) => run.id),
  );

  return runs.map((run) => ({
    ...run,
    hasActiveReply: activeReplyRunIds.has(run.id),
  }));
}

async function getActiveReplyRunIds(db: AppDb, runIds: string[]): Promise<Set<string>> {
  const uniqueRunIds = Array.from(new Set(runIds.filter(Boolean)));

  if (uniqueRunIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ runId: task_run_followups.run_id })
    .from(task_run_followups)
    .where(
      and(
        inArray(task_run_followups.run_id, uniqueRunIds),
        eq(task_run_followups.status, "sending"),
      ),
    )
    .groupBy(task_run_followups.run_id);

  return new Set(rows.map((row) => row.runId));
}

/**
 * Derive the `waiting_for_opencode` sub-state for a running task run. Once the
 * async OpenCode prompt is accepted the executor persists `opencodeMonitor`
 * metadata and keeps the run `running` while the monitor polls, so a running run
 * carrying that metadata is waiting on OpenCode rather than holding a request.
 */
function deriveTaskRunRuntimeState(
  status: string,
  triggerMetadata: Record<string, unknown> | undefined,
): "waiting_for_opencode" | undefined {
  if (status !== "running") {
    return undefined;
  }

  const monitor = triggerMetadata?.["opencodeMonitor"];
  const hasAcceptedPrompt =
    typeof monitor === "object" && monitor !== null && !Array.isArray(monitor);

  return hasAcceptedPrompt ? "waiting_for_opencode" : undefined;
}

function parseTaskTodos(value: string): TaskTodo[] {
  return taskTodoSchema.array().parse(JSON.parse(value));
}

function parseFallbackModels(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    return fallbackModelsSchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeFallbackModels(models: string[] | undefined, primaryModel?: string): string[] {
  const seen = new Set<string>();
  const primary = primaryModel?.trim();
  if (primary) {
    seen.add(primary);
  }

  const normalized: string[] = [];
  for (const raw of models ?? []) {
    const model = raw.trim();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    normalized.push(model);
    if (normalized.length >= MAX_FALLBACK_MODELS) {
      break;
    }
  }

  return normalized;
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
  return value ? persistedTaskRunArtifactSchema.array().parse(JSON.parse(value)) : [];
}

function parseOptional<T>(
  value: string | null,
  schema: { parse(input: unknown): T },
): T | undefined {
  return value ? schema.parse(JSON.parse(value)) : undefined;
}
