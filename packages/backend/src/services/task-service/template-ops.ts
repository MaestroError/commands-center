// createTaskTemplateOps: task-service methods split out of the god-file (issue #99).

import type { TaskServiceRef } from "../task-service.js";
import type { TaskServiceContext } from "./context.js";
import {
  createTaskTemplateInputSchema,
  recurringTaskScheduleSchema,
  taskPermissionProfileSchema,
  type CreateTaskTemplateInput,
  type Task,
  type TaskTemplate,
  type UpdateTaskTemplateInput,
  updateTaskTemplateInputSchema,
} from "@cc/shared/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { createId, now } from "../../db/ids.js";
import { task_templates, tasks } from "../../db/schema/index.js";
import type { CreateTaskFromTemplateInput } from "./context.js";
import {
  mapTask,
  mapTaskTemplate,
  normalizeFallbackModels,
  normalizeTaskContext,
  normalizeTodos,
  parseFallbackModels,
  parseOptional,
  parseTaskTodos,
  stringifyOptional,
  taskGenerationSourceLetter,
} from "./mappers.js";
import { readTemplateNextOccurrenceAt, writeTemplateFile } from "./template-files.js";
import {
  assertMcpToolNameAvailable,
  parseMcpConfigOrDefault,
  resolveMcpConfig,
} from "./template-mcp-config.js";

export function createTaskTemplateOps(ctx: TaskServiceContext, service: TaskServiceRef) {
  const {
    countGeneratedTasksForTemplate,
    enforceTaskLimit,
    getTemplateRow,
    options,
    requireActiveAgent,
    resetTemplateSchedulerState,
  } = ctx;
  return {
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
      const mcpConfig = resolveMcpConfig({ title: parsed.title, input: parsed.mcpConfig });
      assertMcpToolNameAvailable(mcpConfig.toolName, await loadTakenToolNames());

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
        mcpConfig,
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
          mcp_config_json: JSON.stringify(mcpConfig),
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
      const nextTitle = parsed.title ?? existing.title;
      const mcpConfig = resolveMcpConfig({
        title: nextTitle,
        input: parsed.mcpConfig,
        existing: parseMcpConfigOrDefault(existing.mcp_config_json, existing.title),
      });
      assertMcpToolNameAvailable(mcpConfig.toolName, await loadTakenToolNames(id));

      // File-first: update configuration/task-templates/<id>.json.
      await writeTemplateFile(options.config, {
        id,
        defaultAgentId,
        model,
        fallbackModels,
        title: nextTitle,
        description: parsed.description ?? existing.description,
        todos,
        recurrence,
        permissionProfile:
          parsed.permissionProfile === undefined
            ? (parseOptional(existing.permission_profile_json, taskPermissionProfileSchema) ?? null)
            : (parsed.permissionProfile ?? null),
        mcpConfig,
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
          mcp_config_json: JSON.stringify(mcpConfig),
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
      return service.updateTemplate(id, { enabled: true });
    },

    async disableTemplate(id: string): Promise<TaskTemplate | undefined> {
      return service.updateTemplate(id, { enabled: false });
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
  };

  // Effective MCP tool names of all other non-deleted templates, for collision
  // checks on create/edit.
  async function loadTakenToolNames(excludeId?: string): Promise<Set<string>> {
    const rows = await options.db.query.task_templates.findMany({
      where: (table, operators) => operators.isNull(table.deleted_at),
      columns: { id: true, title: true, mcp_config_json: true },
    });

    const names = new Set<string>();
    for (const row of rows) {
      if (excludeId && row.id === excludeId) {
        continue;
      }
      names.add(parseMcpConfigOrDefault(row.mcp_config_json, row.title).toolName);
    }
    return names;
  }
}
