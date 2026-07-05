// Shared task-service context: DI wiring plus the internal helper closures
// used across the operation modules (issue #99 split).

import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { ArtifactService } from "../artifact-service.js";
import {
  MAX_FALLBACK_MODELS,
  queueTaskInputSchema,
  recurringTaskScheduleSchema,
  taskContextSchema,
  taskPermissionProfileSchema,
  type Task,
  type TaskContext,
  type TaskRun,
  type TaskStatus,
} from "@cc/shared/schemas";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { now } from "../../db/ids.js";
import {
  type task_runs,
  task_scheduler_state,
  task_templates,
  tasks,
} from "../../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/api-error.js";
import {
  generatedTasksForTemplateFilter,
  mapTask,
  mapTaskRun,
  mapTemplateAsTask,
  parseFallbackModels,
  parseOptional,
  parseTaskTodos,
} from "./mappers.js";
import {
  getTaskStatusAfterTerminalRun,
  hasErroredSubtaskRun,
  hasReviewSubtaskRun,
  hasTerminalSubtaskRun,
  normalizeTaskStatus,
} from "./status.js";
import { writeTemplateFile } from "./template-files.js";

export const fallbackModelsOverrideSchema = z
  .array(z.string().trim().min(1))
  .max(MAX_FALLBACK_MODELS);

export const queueTaskOptionsSchema = queueTaskInputSchema.extend({
  id: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  fallbackModels: fallbackModelsOverrideSchema.optional(),
  retryOfRunId: z.string().trim().min(1).optional(),
  context: taskContextSchema.optional(),
  renderedPrompt: z.string().optional(),
  renderedContext: z.record(z.string(), z.unknown()).optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
});

export type QueueTaskOptions = z.input<typeof queueTaskOptionsSchema>;

export type CreateTaskFromTemplateInput = {
  occurrenceAt?: string;
  scheduledFor?: string;
  triggerSource?: TaskRun["triggerSource"];
  generatedByAgentId?: string;
  context?: TaskContext;
  // Disabled templates are inert for automation (scheduler, API, agent triggers).
  // Human UI entry points pass `true` to allow an explicit manual override.
  allowDisabled?: boolean;
};

export function createTaskServiceContext(
  options: { db: AppDb; config: RuntimeConfig },
  artifactService: ArtifactService,
) {
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

  return {
    options,
    artifactService,
    requireWritableRun,
    requireTaskRun,
    applyTaskStatusForTerminalRun,
    getTaskStatusAfterTerminalSubtaskRun,
    setEnabled,
    requireActiveAgent,
    enforceTaskLimit,
    requireTask,
    requireTemplate,
    getTaskRow,
    getTemplateRow,
    resetTemplateSchedulerState,
    getTemplateTaskIds,
    countGeneratedTasksForTemplate,
  };
}

export type TaskServiceContext = ReturnType<typeof createTaskServiceContext>;
