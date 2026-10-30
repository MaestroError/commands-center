import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createTaskRunFollowupInputSchema, type TaskRun } from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import { agents, task_run_followups, task_runs, tasks } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import { getTaskStatusAfterTerminalRun } from "./task-service/status.js";
import { mapTaskRun, mapTaskRunFollowup } from "./task-service/mappers.js";

export function createTaskReplyQueueService(db: AppDb) {
  return {
    next(agentId: string) {
      return db
        .select({ reply: task_run_followups, run: task_runs })
        .from(task_run_followups)
        .innerJoin(task_runs, eq(task_runs.id, task_run_followups.run_id))
        .where(
          and(
            eq(task_runs.agent_id, agentId),
            eq(task_run_followups.status, "queued"),
            inArray(task_runs.status, ["completed", "failed", "error", "waiting"]),
            sql`not exists (select 1 from task_run_followups active_reply where active_reply.run_id = ${task_runs.id} and active_reply.status in ('delivering', 'sending', 'blocked'))`,
          ),
        )
        .orderBy(
          sql`max(${task_run_followups.created_at}, coalesce(${task_runs.completed_at}, 0))`,
          task_run_followups.id,
        )
        .get();
    },
    pendingAgents() {
      return db
        .selectDistinct({ agentId: task_runs.agent_id })
        .from(task_run_followups)
        .innerJoin(task_runs, eq(task_runs.id, task_run_followups.run_id))
        .where(inArray(task_run_followups.status, ["queued", "delivering", "sending"]))
        .all();
    },
    get(id: string) {
      return db.select().from(task_run_followups).where(eq(task_run_followups.id, id)).get();
    },
    assertTarget(run: TaskRun) {
      const task = db.select().from(tasks).where(eq(tasks.id, run.taskId)).get();
      const agent = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
      if (!task || task.deleted_at) throw new NotFoundError("Task not found.");
      if (task.archived) throw new BadRequestError("Archived tasks cannot receive replies.");
      if (agent?.status !== "active") throw new BadRequestError("Specialist is unavailable.");
      if (["cancelled", "skipped"].includes(run.status))
        throw new BadRequestError("Cancelled or skipped runs cannot receive replies.");
    },
    claim(id: string, run: TaskRun, baseline: number) {
      return db.transaction((tx) => {
        const current = tx.select().from(task_runs).where(eq(task_runs.id, run.id)).get();
        const reply = tx
          .select()
          .from(task_run_followups)
          .where(eq(task_run_followups.id, id))
          .get();
        if (
          !current ||
          !reply ||
          reply.status !== "queued" ||
          !["completed", "failed", "error", "waiting"].includes(current.status)
        )
          return false;
        if (
          tx
            .select()
            .from(task_runs)
            .where(and(eq(task_runs.agent_id, run.agentId), eq(task_runs.status, "running")))
            .get()
        )
          return false;
        if (
          tx
            .select()
            .from(task_run_followups)
            .where(
              and(
                eq(task_run_followups.run_id, run.id),
                inArray(task_run_followups.status, ["delivering", "sending", "blocked"]),
              ),
            )
            .get()
        )
          return false;
        const task = tx.select().from(tasks).where(eq(tasks.id, run.taskId)).get();
        const agent = tx.select().from(agents).where(eq(agents.id, run.agentId)).get();
        if (!task || task.deleted_at || task.archived || agent?.status !== "active")
          throw new BadRequestError("Reply destination became unavailable.");
        const timestamp = new Date();
        const metadata: Record<string, unknown> = { ...run.triggerMetadata, replyId: id };
        delete metadata["opencodeMonitor"];
        tx.update(task_runs)
          .set({
            status: "running",
            outcome: null,
            needs_human_review: false,
            human_review_reason: null,
            review_question_json: null,
            error_message: null,
            error_details_json: null,
            completed_at: null,
            cancelled_at: null,
            cancellation_reason: null,
            result_text: null,
            final_message: null,
            started_at: timestamp,
            updated_at: timestamp,
            trigger_metadata_json: JSON.stringify(metadata),
          })
          .where(eq(task_runs.id, run.id))
          .run();
        tx.update(task_run_followups)
          .set({
            status: "delivering",
            baseline_message_count: baseline,
            delivery_started_at: timestamp,
            updated_at: timestamp,
            error_message: null,
          })
          .where(eq(task_run_followups.id, id))
          .run();
        tx.update(tasks)
          .set({ status: "queued", updated_at: timestamp })
          .where(and(eq(tasks.id, run.taskId), isNull(tasks.deleted_at)))
          .run();
        return true;
      });
    },
    accept(id: string) {
      db.update(task_run_followups)
        .set({ status: "sending", delivered_at: new Date(), updated_at: new Date() })
        .where(and(eq(task_run_followups.id, id), eq(task_run_followups.status, "delivering")))
        .run();
    },
    block(id: string, reason: string) {
      db.update(task_run_followups)
        .set({ status: "blocked", error_message: reason, updated_at: new Date() })
        .where(
          and(
            eq(task_run_followups.id, id),
            inArray(task_run_followups.status, ["queued", "delivering"]),
          ),
        )
        .run();
    },
    cancel(id: string, runId: string) {
      return db.transaction((tx) => {
        const reply = tx
          .update(task_run_followups)
          .set({ status: "cancelled", updated_at: new Date() })
          .where(
            and(
              eq(task_run_followups.id, id),
              eq(task_run_followups.run_id, runId),
              or(
                eq(task_run_followups.status, "queued"),
                and(
                  eq(task_run_followups.status, "blocked"),
                  isNull(task_run_followups.delivery_started_at),
                ),
              ),
              inArray(task_run_followups.kind, ["operator_reply", "review_answer"]),
            ),
          )
          .returning()
          .get();
        if (!reply) throw new ConflictError("Only undelivered replies can be cancelled.");
        const pending = tx
          .select()
          .from(task_run_followups)
          .where(
            and(
              eq(task_run_followups.task_id, reply.task_id),
              inArray(task_run_followups.status, ["queued", "delivering", "sending", "blocked"]),
            ),
          )
          .get();
        const active = tx
          .select()
          .from(task_runs)
          .where(
            and(
              eq(task_runs.task_id, reply.task_id),
              inArray(task_runs.status, ["queued", "running", "waiting"]),
            ),
          )
          .get();
        if (!pending && !active) {
          const root = tx
            .select()
            .from(task_runs)
            .where(and(eq(task_runs.task_id, reply.task_id), isNull(task_runs.subtask_id)))
            .orderBy(desc(task_runs.created_at), desc(task_runs.id))
            .get();
          const status = root ? getTaskStatusAfterTerminalRun(mapTaskRun(root)) : undefined;
          if (status)
            tx.update(tasks)
              .set({ status, updated_at: new Date() })
              .where(and(eq(tasks.id, reply.task_id), eq(tasks.status, "queued")))
              .run();
        }
        return mapTaskRunFollowup(reply);
      });
    },
    cancelPending(runId: string) {
      db.update(task_run_followups)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(
          and(
            eq(task_run_followups.run_id, runId),
            inArray(task_run_followups.status, ["queued", "blocked"]),
          ),
        )
        .run();
    },
    payload(id: string) {
      const reply = db.select().from(task_run_followups).where(eq(task_run_followups.id, id)).get();
      if (!reply) throw new NotFoundError("Reply not found.");
      return createTaskRunFollowupInputSchema.parse({
        body: reply.body,
        ...(reply.payload_json ? (JSON.parse(reply.payload_json) as Record<string, unknown>) : {}),
      });
    },
  };
}
