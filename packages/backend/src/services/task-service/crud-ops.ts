// createTaskCrudOps: task-service methods split out of the god-file (issue #99).

import type { TaskServiceRef } from "../task-service.js";
import type { TaskServiceContext } from "./context.js";
import {
  appendTaskContextInputSchema,
  createTaskInputSchema,
  type AppendTaskContextInput,
  type Task,
  type TaskContext,
  type TaskStatus,
  updateTaskInputSchema,
} from "@cc/shared/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { createId, now } from "../../db/ids.js";
import { task_templates, tasks } from "../../db/schema/index.js";
import { BadRequestError } from "../../lib/api-error.js";
import {
  mapTask,
  mapTemplateAsTask,
  normalizeFallbackModels,
  normalizeTaskContext,
  normalizeTodos,
  parseFallbackModels,
  parseTaskTodos,
  stringifyOptional,
} from "./mappers.js";
import { normalizeTaskStatus } from "./status.js";
import { deleteTemplateFile } from "./template-files.js";

export function createTaskCrudOps(ctx: TaskServiceContext, service: TaskServiceRef) {
  const { enforceTaskLimit, getTaskRow, getTemplateRow, options, requireActiveAgent, setEnabled } =
    ctx;
  return {
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

        return service.create({
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

      return service.create({
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
      const task = await service.get(id);

      if (!task || task.templateId === task.id) {
        return undefined;
      }

      const text = [task.context.text, parsed.text].filter(Boolean).join("\n\n");
      return service.updateContext(id, { ...task.context, text });
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
      return service.archive(id);
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
      return service.restore(id);
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
  };
}
