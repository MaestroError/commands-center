// createTaskRunOps: task-service methods split out of the god-file (issue #99).

import type { TaskServiceRef } from "../task-service.js";
import type { TaskServiceContext } from "./context.js";
import {
  addTaskRunArtifactInputSchema,
  createTaskRunInputSchema,
  markTaskRunNeedsReviewInputSchema,
  reviewQuestionSchema,
  setTaskRunResultInputSchema,
  type CreateTaskRunInput,
  type TaskRun,
  type TaskRunArtifact,
  type TaskRunStatus,
  type UpdateTaskRunInput,
  updateTaskRunInputSchema,
} from "@cc/shared/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { createId, now } from "../../db/ids.js";
import { task_runs, tasks } from "../../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/api-error.js";
import { type QueueTaskOptions, queueTaskOptionsSchema } from "./context.js";
import {
  isRunningAgentConstraintError,
  mapTaskRunWithReplyState,
  normalizeFallbackModels,
  parseFallbackModels,
  stringifyOptional,
} from "./mappers.js";

const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "error",
  "cancelled",
  "skipped",
]);

export function createTaskRunOps(ctx: TaskServiceContext, service: TaskServiceRef) {
  const {
    applyTaskStatusForTerminalRun,
    artifactService,
    options,
    requireActiveAgent,
    requireTask,
    requireWritableRun,
  } = ctx;
  return {
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

      const running = await service.getRunningRunForAgent(existing.agent_id);

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

        return row ? mapTaskRunWithReplyState(options.db, options.config, row) : undefined;
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

      const activeRun = await service.getActiveRunForTask(task.id, parsed.subtaskId);

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

      const run = await service.createRun({
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

      return mapTaskRunWithReplyState(options.db, options.config, row);
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

      return mapTaskRunWithReplyState(options.db, options.config, row);
    },

    async setRunStatus(
      id: string,
      status: TaskRunStatus,
      input: Omit<UpdateTaskRunInput, "status"> = {},
    ): Promise<TaskRun | undefined> {
      const run = await service.updateRun(id, { ...input, status });

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
      const updated = await service.updateRun(parsed.taskRunId, { resultText: parsed.resultText });

      if (!updated) {
        throw new NotFoundError("Task run not found.");
      }

      return updated;
    },

    async addRunArtifact(
      taskRunId: string,
      agentId: string,
      artifact: TaskRunArtifact,
    ): Promise<TaskRun> {
      const parsed = addTaskRunArtifactInputSchema.parse({ taskRunId, artifact });
      const run = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, parsed.taskRunId),
      });

      if (!run) {
        throw new NotFoundError("Task run not found.");
      }

      if (run.agent_id !== agentId) {
        throw new NotFoundError("Task run not found.");
      }

      // Artifacts are conversation-anchored; resolve the run's own conversation
      // and record the artifact there.
      const conversation = await options.db.query.conversations.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.task_run_id, parsed.taskRunId),
            operators.eq(table.agent_id, agentId),
            operators.eq(table.status, "active"),
          ),
        columns: { id: true, converted_at: true, is_current: true },
      });

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      if (
        !(run.status === "running" && !conversation.converted_at) &&
        !(
          TERMINAL_RUN_STATUSES.has(run.status) &&
          conversation.converted_at &&
          conversation.is_current
        )
      ) {
        throw new ConflictError("Only running task runs can be updated by an agent.");
      }

      await artifactService.create(
        {
          conversationId: conversation.id,
          title: parsed.artifact.title,
          description: parsed.artifact.description,
          type: parsed.artifact.type,
          link: parsed.artifact.link,
        },
        { agentId, currentConvertedTaskRunId: parsed.taskRunId },
      );

      const refreshed = await service.getRunById(run.id);

      if (!refreshed) {
        throw new NotFoundError("Task run not found.");
      }

      return refreshed;
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

      return mapTaskRunWithReplyState(options.db, options.config, updated);
    },
  };
}
