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
import { getSetting } from "../db/helpers.js";
import { now } from "../db/ids.js";
import { task_scheduler_state } from "../db/schema/index.js";
import type { TaskExecutionService } from "./task-execution-service.js";
import type { TaskService } from "./task-service.js";

const DEFAULT_TICK_MS = 30_000;
const DEFAULT_DONE_AUTO_ARCHIVE_WEEKS = 1;
const MAX_RECURRING_SEARCH_DAYS = 3660;
const TASK_DONE_AUTO_ARCHIVE_WEEKS_SETTING = "taskDoneAutoArchiveWeeks";
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

type RecurringTaskSchedule = Extract<Task["schedule"], { mode: "recurring" }>;

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

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
      const [scheduledTasks, recurringTemplates] = await Promise.all([
        options.taskService.list({ status: "scheduled", includeArchived: false }),
        options.taskService.listRecurringTemplates(),
      ]);
      const states = await Promise.all(
        [...scheduledTasks, ...recurringTemplates].map((task) => reconcileTaskState(task, from)),
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
        await archiveDoneTasks(at);
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

      if (!task?.templateId || !scheduledAt) {
        return;
      }

      const template = await options.taskService.get(task.templateId);

      if (!template) {
        return;
      }

      await upsertState(
        template,
        computeNextRunAtAfter(template, scheduledAt, now()),
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

    let scheduledAt = dueAt;

    try {
      if (task.templateId === task.id && task.schedule.mode === "recurring") {
        scheduledAt = computeCatchUpOccurrence(task, dueAt, at);
        const generatedTask = await options.taskService.createTaskFromTemplate(task.id, {
          occurrenceAt: scheduledAt.toISOString(),
          triggerSource: "template",
        });

        if (!generatedTask) {
          throw new Error("Task template not found.");
        }

        const activeRun = await options.taskService.getActiveRunForTask(generatedTask.id);

        if (!activeRun && generatedTask.status !== "queued") {
          await options.executionService.queue(generatedTask.id, {
            triggerSource: "template",
            metadata: { scheduledAt: scheduledAt.toISOString(), templateId: task.id },
          });
        }

        await upsertState(
          task,
          computeNextRunAtAfter(task, scheduledAt, at),
          undefined,
          scheduledAt,
        );
        return;
      }

      await options.executionService.queue(task.id, {
        triggerSource: "scheduled",
        metadata: { scheduledAt: scheduledAt.toISOString() },
      });
      await upsertState(task, undefined, undefined, scheduledAt);
    } catch (error) {
      await createFailedScheduledRun(task, scheduledAt, error);
      await upsertState(
        task,
        computeNextRunAtAfter(task, scheduledAt, at),
        error instanceof Error ? error.message : "Scheduled task run failed.",
        scheduledAt,
      );
    }
  }

  async function createFailedScheduledRun(
    task: Task,
    scheduledAt: Date,
    error: unknown,
  ): Promise<void> {
    const occurrence =
      task.templateId === task.id
        ? await options.taskService.createTaskFromTemplate(task.id, {
            occurrenceAt: scheduledAt.toISOString(),
            scheduledFor: scheduledAt.toISOString(),
            triggerSource: "scheduled",
          })
        : task;

    if (!occurrence) {
      return;
    }

    await options.taskService.createRun({
      taskId: occurrence.id,
      agentId: occurrence.agentId,
      status: "failed",
      triggerSource: "scheduled",
      renderedPrompt: "",
      renderedContext: {
        taskId: occurrence.id,
        templateId: task.id,
        taskTitle: occurrence.title,
        taskDescription: occurrence.description,
        assignedAgentId: occurrence.agentId,
        triggerSource: "scheduled",
        triggerMetadata: { scheduledAt: scheduledAt.toISOString() },
        schedule: task.schedule,
        todos: occurrence.todos,
      },
      errorMessage: error instanceof Error ? error.message : "Scheduled task run failed.",
      errorDetails: {
        errorName: error instanceof Error ? error.name : "UnknownError",
        stage: "scheduled_trigger",
      },
      completedAt: now().toISOString(),
    });
  }

  async function archiveDoneTasks(at: Date): Promise<void> {
    const retentionWeeks = await getDoneAutoArchiveWeeks();
    const archiveBefore = new Date(at.getTime() - retentionWeeks * 7 * 24 * 60 * 60 * 1000);
    const tasks = await options.taskService.listDoneTasksReadyToArchive(archiveBefore);

    for (const task of tasks) {
      await options.taskService.archiveTask(task.id);
    }
  }

  async function getDoneAutoArchiveWeeks(): Promise<number> {
    const setting = await getSetting<unknown>(options.db, TASK_DONE_AUTO_ARCHIVE_WEEKS_SETTING);

    return typeof setting === "number" && Number.isFinite(setting) && setting >= 0
      ? setting
      : DEFAULT_DONE_AUTO_ARCHIVE_WEEKS;
  }

  async function reconcileTaskState(task: Task, from: Date): Promise<TaskSchedulerState> {
    const existing = await options.db.query.task_scheduler_state.findFirst({
      where: (table, operators) => operators.eq(table.task_id, task.id),
    });
    const existingNextRunAt = existing?.next_run_at;

    if (existingNextRunAt && existingNextRunAt <= from) {
      return mapSchedulerState(existing);
    }

    if (task.status === "scheduled" && task.scheduledAt && !existing?.last_scheduled_at) {
      return upsertState(task, new Date(task.scheduledAt));
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

  if (task.status === "scheduled" && task.scheduledAt) {
    const scheduledAt = new Date(task.scheduledAt);
    return scheduledAt > after ? scheduledAt : undefined;
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
  schedule: RecurringTaskSchedule,
  from: Date,
  after = from,
): Date {
  const direct = computeDirectRecurringRun(schedule, from, after, "next");

  if (direct) {
    return direct;
  }

  const timezone = schedule.timezone;
  const anchor = new Date(schedule.anchorAt);
  let candidate = anchor;

  for (let attempts = 0; attempts < MAX_RECURRING_SEARCH_DAYS; attempts += 1) {
    if (candidate > from && candidate > after) {
      return candidate;
    }

    candidate = advanceRecurringCandidate(anchor, candidate, timezone, schedule.repeatRule);
  }

  throw new Error("Could not compute next recurring task run within ten years.");
}

function computeCatchUpOccurrence(task: Task, firstDueAt: Date, at: Date): Date {
  if (task.schedule.mode !== "recurring") {
    return firstDueAt;
  }

  const direct = computeDirectRecurringRun(task.schedule, firstDueAt, at, "latest");

  if (direct) {
    return direct;
  }

  let latest = firstDueAt;

  for (let attempts = 0; attempts < MAX_RECURRING_SEARCH_DAYS; attempts += 1) {
    const next = computeNextRecurringRun(task.schedule, latest);

    if (next > at) {
      return latest;
    }

    latest = next;
  }

  throw new Error("Could not compute latest due recurring task run within ten years.");
}

function computeDirectRecurringRun(
  schedule: RecurringTaskSchedule,
  from: Date,
  after: Date,
  mode: "next" | "latest",
): Date | undefined {
  const rule = schedule.repeatRule;

  if (rule.frequency === "month" || rule.frequency === "year" || rule.weekdays?.length) {
    return undefined;
  }

  const timezone = schedule.timezone;
  const interval = rule.frequency === "week" ? rule.interval * 7 : rule.interval;
  const unit = rule.frequency === "hour" ? "hour" : "day";
  const anchorParts = readZonedDateTimeParts(new Date(schedule.anchorAt), timezone);
  const fromParts = readZonedDateTimeParts(from, timezone);
  const afterParts = readZonedDateTimeParts(after, timezone);

  if (mode === "next") {
    const fromCount = Math.floor(readZonedUnitDistance(anchorParts, fromParts, unit) / interval);
    const afterCount = Math.floor(readZonedUnitDistance(anchorParts, afterParts, unit) / interval);
    let count = Math.max(0, fromCount, afterCount);
    let candidate = fromZonedDateTimeParts(
      addZonedUnits(anchorParts, count * interval, unit),
      timezone,
    );

    while (candidate <= from || candidate <= after) {
      count += 1;
      candidate = fromZonedDateTimeParts(
        addZonedUnits(anchorParts, count * interval, unit),
        timezone,
      );
    }

    return candidate;
  }

  let count = Math.max(
    0,
    Math.floor(readZonedUnitDistance(fromParts, afterParts, unit) / interval),
  );
  let candidate = fromZonedDateTimeParts(
    addZonedUnits(fromParts, count * interval, unit),
    timezone,
  );

  while (candidate > after && count > 0) {
    count -= 1;
    candidate = fromZonedDateTimeParts(addZonedUnits(fromParts, count * interval, unit), timezone);
  }

  return candidate;
}

function addZonedUnits(
  value: ZonedDateTimeParts,
  count: number,
  unit: "hour" | "day",
): ZonedDateTimeParts {
  return unit === "hour" ? addZonedHours(value, count) : addZonedDays(value, count);
}

function readZonedUnitDistance(
  left: ZonedDateTimeParts,
  right: ZonedDateTimeParts,
  unit: "hour" | "day",
): number {
  if (unit === "day") {
    return daysBetweenZonedDates(left, right);
  }

  const leftTime = readZonedLocalTimeMs(left);
  const rightTime = readZonedLocalTimeMs(right);
  return Math.floor((rightTime - leftTime) / 3_600_000);
}

function readZonedLocalTimeMs(value: ZonedDateTimeParts): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
}

function advanceRecurringCandidate(
  anchor: Date,
  current: Date,
  timezone: string,
  rule: Extract<Task["schedule"], { mode: "recurring" }>["repeatRule"],
): Date {
  const anchorParts = readZonedDateTimeParts(anchor, timezone);
  const currentParts = readZonedDateTimeParts(current, timezone);

  if (rule.frequency === "hour") {
    return fromZonedDateTimeParts(addZonedHours(currentParts, rule.interval), timezone);
  }

  if (rule.frequency === "day") {
    return fromZonedDateTimeParts(addZonedDays(currentParts, rule.interval), timezone);
  }

  if (rule.frequency === "week" && rule.weekdays?.length) {
    return nextWeeklyWeekday(anchorParts, currentParts, timezone, rule.interval, rule.weekdays);
  }

  if (rule.frequency === "week") {
    return fromZonedDateTimeParts(addZonedDays(currentParts, rule.interval * 7), timezone);
  }

  if (rule.frequency === "month") {
    return fromZonedDateTimeParts(
      addZonedMonths(anchorParts, currentParts, rule.interval),
      timezone,
    );
  }

  return fromZonedDateTimeParts(addZonedYears(anchorParts, currentParts, rule.interval), timezone);
}

function nextWeeklyWeekday(
  anchor: ZonedDateTimeParts,
  current: ZonedDateTimeParts,
  timezone: string,
  interval: number,
  weekdays: number[],
): Date {
  const selected = [...new Set(weekdays)].sort((left, right) => left - right);
  let candidate = withZonedAnchorTime(addZonedDays(current, 1), anchor);

  for (let attempts = 0; attempts < 3660; attempts += 1) {
    const weeksSinceAnchor = Math.floor(daysBetweenZonedDates(anchor, candidate) / 7);

    if (
      weeksSinceAnchor >= 0 &&
      weeksSinceAnchor % interval === 0 &&
      selected.includes(readZonedWeekday(candidate))
    ) {
      return fromZonedDateTimeParts(candidate, timezone);
    }

    candidate = withZonedAnchorTime(addZonedDays(candidate, 1), anchor);
  }

  throw new Error("Could not compute next weekly recurring task run within ten years.");
}

function addZonedHours(value: ZonedDateTimeParts, hours: number): ZonedDateTimeParts {
  return readUtcDateTimeParts(
    new Date(
      Date.UTC(
        value.year,
        value.month - 1,
        value.day,
        value.hour + hours,
        value.minute,
        value.second,
        value.millisecond,
      ),
    ),
  );
}

function addZonedDays(value: ZonedDateTimeParts, days: number): ZonedDateTimeParts {
  return readUtcDateTimeParts(
    new Date(
      Date.UTC(
        value.year,
        value.month - 1,
        value.day + days,
        value.hour,
        value.minute,
        value.second,
        value.millisecond,
      ),
    ),
  );
}

function addZonedMonths(
  anchor: ZonedDateTimeParts,
  current: ZonedDateTimeParts,
  months: number,
): ZonedDateTimeParts {
  const next = readUtcDateTimeParts(
    new Date(Date.UTC(current.year, current.month - 1 + months, 1)),
  );

  return {
    ...withZonedAnchorTime(next, anchor),
    day: Math.min(anchor.day, daysInMonth(next.year, next.month)),
  };
}

function addZonedYears(
  anchor: ZonedDateTimeParts,
  current: ZonedDateTimeParts,
  years: number,
): ZonedDateTimeParts {
  const next = { ...current, year: current.year + years, month: anchor.month };

  return {
    ...withZonedAnchorTime(next, anchor),
    day: Math.min(anchor.day, daysInMonth(next.year, next.month)),
  };
}

function withZonedAnchorTime(
  value: ZonedDateTimeParts,
  anchor: ZonedDateTimeParts,
): ZonedDateTimeParts {
  return {
    ...value,
    hour: anchor.hour,
    minute: anchor.minute,
    second: anchor.second,
    millisecond: anchor.millisecond,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysBetweenZonedDates(left: ZonedDateTimeParts, right: ZonedDateTimeParts): number {
  const leftDay = Date.UTC(left.year, left.month - 1, left.day);
  const rightDay = Date.UTC(right.year, right.month - 1, right.day);
  return Math.floor((rightDay - leftDay) / 86_400_000);
}

function readZonedWeekday(value: ZonedDateTimeParts): number {
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
}

function readZonedDateTimeParts(value: Date, timezone: string): ZonedDateTimeParts {
  const parts = getZonedFormatter(timezone).formatToParts(value);
  const values = new Map<Intl.DateTimeFormatPartTypes, string>();

  for (const part of parts) {
    if (part.type !== "literal") {
      values.set(part.type, part.value);
    }
  }

  return {
    year: Number.parseInt(values.get("year") ?? "", 10),
    month: Number.parseInt(values.get("month") ?? "", 10),
    day: Number.parseInt(values.get("day") ?? "", 10),
    hour: Number.parseInt(values.get("hour") ?? "", 10),
    minute: Number.parseInt(values.get("minute") ?? "", 10),
    second: Number.parseInt(values.get("second") ?? "", 10),
    millisecond: value.getUTCMilliseconds(),
  };
}

function readUtcDateTimeParts(value: Date): ZonedDateTimeParts {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
    millisecond: value.getUTCMilliseconds(),
  };
}

function fromZonedDateTimeParts(value: ZonedDateTimeParts, timezone: string): Date {
  const utcTime = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
  let candidate = new Date(utcTime);

  for (let attempts = 0; attempts < 6; attempts += 1) {
    const offset = readTimezoneOffsetMs(candidate, timezone);
    const next = new Date(utcTime - offset);

    if (zonedDateTimePartsEqual(readZonedDateTimeParts(next, timezone), value)) {
      return next;
    }

    candidate = next;
  }

  return candidate;
}

function readTimezoneOffsetMs(value: Date, timezone: string): number {
  const parts = readZonedDateTimeParts(value, timezone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  return zonedAsUtc - value.getTime();
}

function zonedDateTimePartsEqual(left: ZonedDateTimeParts, right: ZonedDateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second &&
    left.millisecond === right.millisecond
  );
}

function getZonedFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = zonedFormatters.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  zonedFormatters.set(timezone, formatter);
  return formatter;
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
