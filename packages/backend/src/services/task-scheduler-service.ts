import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import {
  schedulerStatusSchema,
  taskSchedulerStateListSchema,
  taskSchedulerStateSchema,
  type SchedulerStatus,
  type Task,
  type TaskSchedulerState,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { now } from "../db/ids.js";
import { task_scheduler_state } from "../db/schema/index.js";
import type { TaskExecutionService } from "./task-execution-service.js";
import type { TaskService } from "./task-service.js";

const DEFAULT_TICK_MS = 30_000;

export type TaskSchedulerService = ReturnType<typeof createTaskSchedulerService>;

export function createTaskSchedulerService(options: {
  db: AppDb;
  taskService: TaskService;
  executionService: TaskExecutionService;
  logger?: Logger;
  tickMs?: number;
}) {
  let state: SchedulerStatus["state"] = "inactive";
  let lastError: string | undefined;
  let interval: NodeJS.Timeout | undefined;
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;

  return {
    getStatus(): SchedulerStatus {
      return schedulerStatusSchema.parse({
        state,
        healthy: state !== "error",
        driver: "local",
        lastError,
      });
    },

    start(): void {
      if (interval) {
        return;
      }

      state = "running";
      interval = setInterval(() => {
        void this.tick();
      }, tickMs);
      interval.unref();
      void this.reconcile();
      void this.tick();
    },

    stop(): void {
      state = "stopping";
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
      state = "inactive";
    },

    async reconcile(from = now()): Promise<TaskSchedulerState[]> {
      const scheduledTasks = await options.taskService.list({ includeArchived: false });
      const states = await Promise.all(
        scheduledTasks
          .filter((task) => task.triggerMode !== "manual")
          .map((task) => reconcileTaskState(task, from)),
      );

      return taskSchedulerStateListSchema.parse(states);
    },

    async listStates(): Promise<TaskSchedulerState[]> {
      const rows = await options.db.query.task_scheduler_state.findMany({
        orderBy: (table, operators) => [operators.asc(table.next_run_at)],
      });

      return taskSchedulerStateListSchema.parse(rows.map(mapSchedulerState));
    },

    async tick(at = now()): Promise<TaskSchedulerState[]> {
      if (state === "inactive") {
        state = "running";
      }

      try {
        await this.reconcile(at);
        const dueRows = await options.db.query.task_scheduler_state.findMany({
          where: (table, operators) =>
            operators.and(
              operators.isNotNull(table.next_run_at),
              operators.lte(table.next_run_at, at),
            ),
          orderBy: (table, operators) => [operators.asc(table.next_run_at)],
        });

        for (const dueRow of dueRows) {
          await runDueTask(dueRow.task_id, at);
        }

        state = interval ? "running" : "inactive";
        lastError = undefined;
        return this.listStates();
      } catch (error) {
        state = "error";
        lastError = error instanceof Error ? error.message : "Task scheduler tick failed.";
        options.logger?.error({ err: error }, "task scheduler tick failed");
        throw error;
      }
    },
  };

  async function runDueTask(taskId: string, at: Date): Promise<void> {
    const task = await options.taskService.get(taskId);

    if (
      !task ||
      task.archived ||
      !task.enabled ||
      task.status === "disabled" ||
      task.status === "draft"
    ) {
      await upsertState(task, undefined, "Task is disabled, archived, missing, or draft.");
      return;
    }

    try {
      await options.executionService.trigger(task.id, {
        triggerSource: "scheduled",
        metadata: { scheduledAt: at.toISOString() },
      });
      await upsertState(task, computeNextRunAt(task, at), undefined, at);
    } catch (error) {
      await upsertState(
        task,
        computeNextRunAt(task, at),
        error instanceof Error ? error.message : "Scheduled task run failed.",
        at,
      );
    }
  }

  async function reconcileTaskState(task: Task, from: Date): Promise<TaskSchedulerState> {
    const existing = await options.db.query.task_scheduler_state.findFirst({
      where: (table, operators) => operators.eq(table.task_id, task.id),
    });
    const existingNextRunAt = existing?.next_run_at;

    if (existingNextRunAt && existingNextRunAt <= from) {
      return mapSchedulerState(existing);
    }

    return upsertState(task, computeNextRunAt(task, getScheduleBaseTime(task, existing, from)));
  }

  function getScheduleBaseTime(
    task: Task,
    existing: typeof task_scheduler_state.$inferSelect | undefined,
    from: Date,
  ): Date {
    if (existing?.last_scheduled_at) {
      return existing.last_scheduled_at;
    }

    if (existing) {
      return from;
    }

    return new Date(task.createdAt);
  }

  async function upsertState(
    task: Task | undefined,
    nextRunAt?: Date,
    error?: string,
    lastScheduledAt?: Date,
  ): Promise<TaskSchedulerState> {
    if (!task) {
      throw new Error("Cannot persist scheduler state for missing task.");
    }

    const timestamp = now();
    const existing = await options.db.query.task_scheduler_state.findFirst({
      where: (table, operators) => operators.eq(table.task_id, task.id),
    });

    if (existing) {
      const [row] = await options.db
        .update(task_scheduler_state)
        .set({
          next_run_at: nextRunAt ?? null,
          last_scheduled_at: lastScheduledAt ?? existing.last_scheduled_at,
          last_error: error ?? null,
          updated_at: timestamp,
        })
        .where(eq(task_scheduler_state.task_id, task.id))
        .returning();

      if (!row) {
        throw new Error("Failed to update task scheduler state.");
      }

      return mapSchedulerState(row);
    }

    const [row] = await options.db
      .insert(task_scheduler_state)
      .values({
        task_id: task.id,
        next_run_at: nextRunAt ?? null,
        last_scheduled_at: lastScheduledAt ?? null,
        last_error: error ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create task scheduler state.");
    }

    return mapSchedulerState(row);
  }
}

export function computeNextRunAt(task: Task, from: Date): Date | undefined {
  if (!task.enabled || task.archived || task.status === "disabled" || task.status === "draft") {
    return undefined;
  }

  if (task.schedule.mode === "scheduled_once") {
    const runAt = new Date(task.schedule.runAt);
    return runAt > from ? runAt : undefined;
  }

  if (task.schedule.mode === "recurring") {
    return computeNextCronRun(task.schedule.cronExpression, from);
  }

  return undefined;
}

export function computeNextCronRun(expression: string, from: Date): Date {
  const fields = expression.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error("Recurring task schedule must use five-field cron syntax.");
  }

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;
  const start = new Date(from.getTime() + 60_000);
  start.setUTCSeconds(0, 0);

  for (let offsetMinutes = 0; offsetMinutes < 366 * 24 * 60; offsetMinutes += 1) {
    const candidate = new Date(start.getTime() + offsetMinutes * 60_000);

    if (
      matchesCronField(minuteField, candidate.getUTCMinutes(), 0, 59) &&
      matchesCronField(hourField, candidate.getUTCHours(), 0, 23) &&
      matchesCronField(dayOfMonthField, candidate.getUTCDate(), 1, 31) &&
      matchesCronField(monthField, candidate.getUTCMonth() + 1, 1, 12) &&
      matchesCronField(dayOfWeekField, candidate.getUTCDay(), 0, 7)
    ) {
      return candidate;
    }
  }

  throw new Error("Could not compute next recurring task run within one year.");
}

function matchesCronField(
  field: string | undefined,
  value: number,
  min: number,
  max: number,
): boolean {
  if (!field) {
    return false;
  }

  return field.split(",").some((part) => matchesCronPart(part, value, min, max));
}

function matchesCronPart(part: string, value: number, min: number, max: number): boolean {
  if (part === "*") {
    return true;
  }

  if (part.startsWith("*/")) {
    const step = Number.parseInt(part.slice(2), 10);
    return Number.isInteger(step) && step > 0 && (value - min) % step === 0;
  }

  if (part.includes("-")) {
    const [rawStart, rawEnd] = part.split("-");
    const start = Number.parseInt(rawStart ?? "", 10);
    const end = Number.parseInt(rawEnd ?? "", 10);
    return (
      isWithinRange(start, min, max) &&
      isWithinRange(end, min, max) &&
      value >= start &&
      value <= end
    );
  }

  const parsed = Number.parseInt(part, 10);
  const normalized = max === 7 && parsed === 7 ? 0 : parsed;
  return isWithinRange(parsed, min, max) && value === normalized;
}

function isWithinRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function mapSchedulerState(row: typeof task_scheduler_state.$inferSelect): TaskSchedulerState {
  return taskSchedulerStateSchema.parse({
    taskId: row.task_id,
    nextRunAt: row.next_run_at?.toISOString(),
    lastScheduledAt: row.last_scheduled_at?.toISOString(),
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
