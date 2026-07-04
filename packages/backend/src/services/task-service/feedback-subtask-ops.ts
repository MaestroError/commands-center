// createTaskFeedbackSubtaskOps: task-service methods split out of the god-file (issue #99).

import type { TaskServiceRef } from "../task-service.js";
import type { TaskServiceContext } from "./context.js";
import {
  createTaskFeedbackInputSchema,
  createTaskRunFollowupInputSchema,
  taskFeedbackThreadSchema,
  taskSubtaskInputSchema,
  type TaskFeedbackThread,
  type TaskRun,
  type TaskRunFollowup,
  type TaskSubtask,
  type UpdateTaskSubtaskInput,
  updateTaskFeedbackInputSchema,
  updateTaskSubtaskInputSchema,
} from "@cc/shared/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createId, now } from "../../db/ids.js";
import { task_feedback, task_run_followups, task_subtasks } from "../../db/schema/index.js";
import { ConflictError } from "../../lib/api-error.js";
import { mapSubtaskDetail, mapTaskRunFollowup, mapTaskSubtask } from "./mappers.js";

export function createTaskFeedbackSubtaskOps(ctx: TaskServiceContext, service: TaskServiceRef) {
  const { options, requireActiveAgent, requireTask } = ctx;
  return {
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

      const threads = await service.listFeedback(taskId);
      return threads.find((thread) => thread.id === feedbackId);
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
  };
}
