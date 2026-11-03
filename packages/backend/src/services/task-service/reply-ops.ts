import {
  createTaskRunFollowupInputSchema,
  type TaskRun,
  type TaskRunFollowup,
} from "@cc/shared/schemas";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createId, now } from "../../db/ids.js";
import { agents, task_run_followups, task_runs, tasks } from "../../db/schema/index.js";
import { ConflictError } from "../../lib/api-error.js";
import type { TaskServiceContext } from "./context.js";
import { mapTaskRunFollowup } from "./mappers.js";

export function createTaskReplyOps(ctx: TaskServiceContext) {
  const { options, requireTask } = ctx;
  return {
    async insertFollowup(
      target: Pick<TaskRun, "taskId"> & { id?: string },
      input: unknown,
      internalKind?: "recovery",
    ): Promise<TaskRunFollowup> {
      const parsed = createTaskRunFollowupInputSchema.parse(input);
      const requestId = parsed.requestId
        ? `${internalKind ?? "operator"}:${parsed.requestId}`
        : undefined;
      const task = await requireTask(target.taskId, { includeArchived: true });
      if (task.archived) throw new ConflictError("Archived tasks cannot receive replies.");
      const row = options.db.transaction((tx) => {
        const run = tx
          .select()
          .from(task_runs)
          .where(
            target.id
              ? and(eq(task_runs.id, target.id), eq(task_runs.task_id, task.id))
              : and(eq(task_runs.task_id, task.id), isNull(task_runs.subtask_id)),
          )
          .orderBy(desc(task_runs.created_at), desc(task_runs.id))
          .get();
        if (target.id && !run) throw new ConflictError("Task run is unavailable.");
        if (run && ["cancelled", "skipped"].includes(run.status))
          throw new ConflictError(
            "Continue the stopped execution before replying, or duplicate the task.",
          );
        const agent = tx
          .select()
          .from(agents)
          .where(eq(agents.id, run?.agent_id ?? task.default_agent_id ?? task.agent_id))
          .get();
        if (agent?.status !== "active") throw new ConflictError("Specialist is unavailable.");
        const destination = run
          ? eq(task_run_followups.run_id, run.id)
          : isNull(task_run_followups.run_id);
        if (requestId) {
          const existing = tx
            .select()
            .from(task_run_followups)
            .where(
              and(
                eq(task_run_followups.task_id, task.id),
                destination,
                eq(task_run_followups.request_id, requestId),
              ),
            )
            .get();
          if (existing) {
            if (existing.payload_json !== JSON.stringify(parsed))
              throw new ConflictError("Request ID already used for a different reply.");
            return existing;
          }
        }
        const timestamp = now();
        const inserted = tx
          .insert(task_run_followups)
          .values({
            id: createId(),
            task_id: task.id,
            run_id: run?.id ?? null,
            kind: internalKind ?? parsed.kind,
            status: "queued",
            request_id: requestId,
            payload_json: JSON.stringify(parsed),
            body: parsed.body,
            created_at: timestamp,
            updated_at: timestamp,
          })
          .returning()
          .get();
        if (run && !run.subtask_id)
          tx.update(tasks)
            .set({ status: "queued", updated_at: timestamp })
            .where(eq(tasks.id, task.id))
            .run();
        return inserted;
      });
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
  };
}
