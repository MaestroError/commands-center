import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import {
  schedulerStatusSchema,
  taskSchedulerStateListSchema,
  taskSchedulerStateSchema,
  type SchedulerStatus,
  type Task,
  type TaskRun,
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
          await runDueTask(dueRow.task_id, dueRow.next_run_at ?? at, at);
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

    async handleRunTerminal(run: TaskRun): Promise<void> {
      if (run.triggerSource !== "scheduled" || !isTerminalRunStatus(run.status)) {
        return;
      }

      const task = await options.taskService.get(run.taskId);
      const scheduledAt = readScheduledAt(run);

      if (!task || !scheduledAt) {
        return;
      }

      await upsertState(
        task,
        computeNextRunAtAfter(task, scheduledAt, now()),
        undefined,
        scheduledAt,
      );
    },
  };

  async function runDueTask(taskId: string, dueAt: Date, at: Date): Promise<void> {
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
      const scheduledAt = readLatestDueOccurrence(task, dueAt, at);
      await options.executionService.trigger(task.id, {
        triggerSource: "scheduled",
        metadata: { scheduledAt: scheduledAt.toISOString() },
      });
      await upsertState(task, undefined, undefined, scheduledAt);
    } catch (error) {
      await upsertState(
        task,
        computeNextRunAtAfter(task, at, at),
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
  return computeNextRunAtAfter(task, from, from);
}

function computeNextRunAtAfter(task: Task, from: Date, after: Date): Date | undefined {
  if (!task.enabled || task.archived || task.status === "disabled" || task.status === "draft") {
    return undefined;
  }

  if (task.schedule.mode === "scheduled_once") {
    const runAt = new Date(task.schedule.runAt);
    return runAt > from && runAt > after ? runAt : undefined;
  }

  if (task.schedule.mode === "recurring") {
    return computeNextRecurringRun(task.schedule, from, after);
  }

  return undefined;
}

export function computeNextRecurringRun(
  schedule: Extract<Task["schedule"], { mode: "recurring" }>,
  from: Date,
  after = from,
): Date {
  const anchor = new Date(schedule.anchorAt);
  let candidate = anchor;

  for (let attempts = 0; attempts < 3660; attempts += 1) {
    if (candidate > from && candidate > after) {
      return candidate;
    }

    candidate = advanceRecurringCandidate(anchor, candidate, schedule.repeatRule);
  }

  throw new Error("Could not compute next recurring task run within ten years.");
}

function readLatestDueOccurrence(task: Task, firstDueAt: Date, at: Date): Date {
  if (task.schedule.mode !== "recurring") {
    return firstDueAt;
  }

  let latest = firstDueAt;

  for (let attempts = 0; attempts < 3660; attempts += 1) {
    const next = computeNextRecurringRun(task.schedule, latest);

    if (next > at) {
      return latest;
    }

    latest = next;
  }

  return latest;
}

function advanceRecurringCandidate(
  anchor: Date,
  current: Date,
  rule: Extract<Task["schedule"], { mode: "recurring" }>["repeatRule"],
): Date {
  if (rule.frequency === "hour") {
    return addUtcHours(current, rule.interval);
  }

  if (rule.frequency === "day") {
    return addUtcDays(current, rule.interval);
  }

  if (rule.frequency === "week" && rule.weekdays?.length) {
    return nextWeeklyWeekday(anchor, current, rule.interval, rule.weekdays);
  }

  if (rule.frequency === "week") {
    return addUtcDays(current, rule.interval * 7);
  }

  if (rule.frequency === "month") {
    return addUtcMonths(anchor, current, rule.interval);
  }

  return addUtcYears(anchor, current, rule.interval);
}

function nextWeeklyWeekday(
  anchor: Date,
  current: Date,
  interval: number,
  weekdays: number[],
): Date {
  const selected = [...new Set(weekdays)].sort((left, right) => left - right);
  let candidate = addUtcDays(current, 1);

  for (let attempts = 0; attempts < 3660; attempts += 1) {
    const weeksSinceAnchor = Math.floor(daysBetweenUtc(anchor, candidate) / 7);

    if (
      weeksSinceAnchor >= 0 &&
      weeksSinceAnchor % interval === 0 &&
      selected.includes(candidate.getUTCDay())
    ) {
      return withAnchorTime(candidate, anchor);
    }

    candidate = addUtcDays(candidate, 1);
  }

  throw new Error("Could not compute next weekly recurring task run within ten years.");
}

function addUtcHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(anchor: Date, current: Date, months: number): Date {
  const next = new Date(current);
  next.setUTCMonth(next.getUTCMonth() + months, 1);
  next.setUTCDate(Math.min(anchor.getUTCDate(), daysInUtcMonth(next)));
  return withAnchorTime(next, anchor);
}

function addUtcYears(anchor: Date, current: Date, years: number): Date {
  const next = new Date(current);
  next.setUTCFullYear(next.getUTCFullYear() + years, anchor.getUTCMonth(), 1);
  next.setUTCDate(Math.min(anchor.getUTCDate(), daysInUtcMonth(next)));
  return withAnchorTime(next, anchor);
}

function withAnchorTime(value: Date, anchor: Date): Date {
  const next = new Date(value);
  next.setUTCHours(
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  );
  return next;
}

function daysInUtcMonth(value: Date): number {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
}

function daysBetweenUtc(left: Date, right: Date): number {
  const leftDay = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const rightDay = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
  return Math.floor((rightDay - leftDay) / 86_400_000);
}

function readScheduledAt(run: TaskRun): Date | undefined {
  const metadata = run.renderedContext?.["triggerMetadata"];

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const scheduledAt = (metadata as Record<string, unknown>)["scheduledAt"];
  return typeof scheduledAt === "string" ? new Date(scheduledAt) : undefined;
}

function isTerminalRunStatus(status: TaskRun["status"]): boolean {
  return ["completed", "failed", "cancelled", "skipped"].includes(status);
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
