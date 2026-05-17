import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import {
  computeNextRecurringRun,
  createTaskSchedulerService,
} from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

describe("createTaskSchedulerService", () => {
  it("computes hourly recurring runs", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-06-01T09:30:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "hour", interval: 4 },
      },
      new Date("2026-06-01T12:07:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-06-01T13:30:00.000Z");
  });

  it("computes daily recurring runs", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-06-01T09:00:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "day", interval: 1 },
      },
      new Date("2026-06-01T12:07:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-06-02T09:00:00.000Z");
  });

  it("computes weekly selected weekday recurring runs", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-06-01T09:00:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "week", interval: 1, weekdays: [2, 4] },
      },
      new Date("2026-06-02T10:00:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-06-04T09:00:00.000Z");
  });

  it("computes monthly day-of-month recurring runs", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-01-31T09:00:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "month", interval: 1 },
      },
      new Date("2026-01-31T10:00:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("runs due one-time scheduled tasks once", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const schedulerServiceRef: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
    const executionService = createTaskExecutionService({
      taskService,
      onRunTerminal: (run) => schedulerServiceRef.current?.handleRunTerminal(run),
    });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });
    schedulerServiceRef.current = schedulerService;

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "One-time",
        triggerMode: "scheduled_once",
        schedule: { mode: "scheduled_once", runAt: "2026-06-01T12:00:00.000Z" },
      });

      await schedulerService.tick(new Date("2026-06-01T12:01:00.000Z"));
      await schedulerService.tick(new Date("2026-06-01T12:02:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      const states = await schedulerService.listStates();

      expect(runs).toHaveLength(1);
      await expect
        .poll(async () => (await taskService.getRunById(String(runs[0]?.id)))?.status)
        .toBe("completed");
      expect(states.find((state) => state.taskId === task.id)?.nextRunAt).toBeUndefined();
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("runs recurring tasks and advances next run state", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const schedulerServiceRef: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
    const executionService = createTaskExecutionService({
      taskService,
      onRunTerminal: (run) => schedulerServiceRef.current?.handleRunTerminal(run),
    });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });
    schedulerServiceRef.current = schedulerService;

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Recurring",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T12:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2026-06-02T12:00:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      await expect
        .poll(
          async () =>
            (await schedulerService.listStates()).find((state) => state.taskId === task.id)
              ?.nextRunAt,
        )
        .toBe("2026-06-03T12:00:00.000Z");

      expect(runs).toHaveLength(1);
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("runs the latest overdue recurring occurrence once", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const schedulerServiceRef: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
    const executionService = createTaskExecutionService({
      taskService,
      onRunTerminal: (run) => schedulerServiceRef.current?.handleRunTerminal(run),
    });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });
    schedulerServiceRef.current = schedulerService;

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Weekdays",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] },
        },
      });

      await schedulerService.tick(new Date("2026-06-08T12:00:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      await expect
        .poll(
          async () =>
            (await schedulerService.listStates()).find((state) => state.taskId === task.id)
              ?.nextRunAt,
        )
        .toBe("2026-06-09T09:00:00.000Z");

      expect(runs).toHaveLength(1);
      expect(runs[0]?.renderedContext?.["triggerMetadata"]).toEqual({
        scheduledAt: "2026-06-08T09:00:00.000Z",
      });
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });
});

async function insertAgent(db: AppDb): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${crypto.randomUUID()}`;
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Task Agent",
      role: "help with tasks",
      instructions: "Be useful.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert test agent.");
  }

  return agent;
}
