import { describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../src/db/client";
import { upsertSetting } from "../../src/db/helpers";
import { agents, task_scheduler_state } from "../../src/db/schema/index";
import {
  createTaskExecutionService,
  type TaskExecutionService,
} from "../../src/services/task-execution-service";
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

  it("keeps daily recurring runs at the configured timezone wall time across DST", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-03-07T14:00:00.000Z",
        timezone: "America/New_York",
        repeatRule: { frequency: "day", interval: 1 },
      },
      new Date("2026-03-08T15:00:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-03-09T13:00:00.000Z");
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

  it("matches weekly selected weekdays in the configured timezone", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-06-01T04:30:00.000Z",
        timezone: "Asia/Tbilisi",
        repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
      },
      new Date("2026-06-01T05:00:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-06-08T04:30:00.000Z");
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

  it("keeps monthly recurring runs at the configured timezone wall time across DST", () => {
    const next = computeNextRecurringRun(
      {
        mode: "recurring",
        anchorAt: "2026-10-31T13:00:00.000Z",
        timezone: "America/New_York",
        repeatRule: { frequency: "month", interval: 1 },
      },
      new Date("2026-10-31T14:00:00.000Z"),
    );

    expect(next.toISOString()).toBe("2026-11-30T14:00:00.000Z");
  });

  it("keeps unscheduled tasks out of the board scheduler", async () => {
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
      });

      await schedulerService.tick(new Date("2026-06-01T12:01:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      const states = await schedulerService.listStates();

      expect(runs).toHaveLength(0);
      expect(states.find((state) => state.taskId === task.id)).toBeUndefined();
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("queues due board scheduled tasks once", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const schedulerServiceRef: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
    const executionService = createTaskExecutionService({
      db: testDb.client.db,
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
        title: "Board scheduled",
        status: "scheduled",
        scheduledAt: "2026-06-01T12:00:00.000Z",
      });

      await schedulerService.tick(new Date("2026-06-01T12:01:00.000Z"));
      await expect.poll(async () => await taskService.listRuns(task.id)).toHaveLength(1);
      await schedulerService.tick(new Date("2026-06-01T12:02:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      const queued = await taskService.get(task.id);

      expect(runs).toHaveLength(1);
      expect(runs[0]?.triggerSource).toBe("scheduled");
      expect(queued?.status).toBe("ready_to_check");
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("runs recurring templates and advances next run state", async () => {
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
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Recurring",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T12:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2026-06-02T12:00:00.000Z"));

      const runs = await taskService.listRuns(template.id);
      const occurrences = await taskService.listTemplateTasks(template.id);
      await expect
        .poll(
          async () =>
            (await schedulerService.listStates()).find((state) => state.taskId === template.id)
              ?.nextRunAt,
        )
        .toBe("2026-06-03T12:00:00.000Z");

      expect(runs).toHaveLength(1);
      expect(occurrences).toHaveLength(1);
      expect(runs[0]?.taskId).toBe(occurrences[0]?.id);
      expect(occurrences[0]?.sourceTemplateId).toBe(template.id);
      expect(occurrences[0]?.sourceOccurrenceAt).toBe("2026-06-02T12:00:00.000Z");
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("does not generate duplicate recurring tasks on duplicate ticks", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const schedulerServiceRef: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
    const executionService = createTaskExecutionService({
      db: testDb.client.db,
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
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Recurring once",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T12:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2026-06-02T12:00:00.000Z"));
      await schedulerService.tick(new Date("2026-06-02T12:00:00.000Z"));

      const occurrences = await taskService.listTemplateTasks(template.id);
      const runs = await taskService.listRuns(template.id);

      expect(occurrences).toHaveLength(1);
      expect(runs).toHaveLength(1);
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("reconciles scheduler state idempotently when called concurrently", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Concurrent scheduled",
        status: "scheduled",
        scheduledAt: "2026-06-03T12:00:00.000Z",
      });

      await Promise.all([
        schedulerService.reconcile(new Date("2026-06-02T12:00:00.000Z")),
        schedulerService.reconcile(new Date("2026-06-02T12:00:00.000Z")),
      ]);

      const states = await schedulerService.listStates();

      expect(states.filter((state) => state.taskId === task.id)).toHaveLength(1);
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("deletes stale due scheduler state for missing tasks", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      const timestamp = new Date("2026-06-01T12:00:00.000Z");
      await testDb.client.db.insert(task_scheduler_state).values({
        task_id: "missing-task",
        next_run_at: timestamp,
        last_scheduled_at: null,
        last_error: null,
        created_at: timestamp,
        updated_at: timestamp,
      });

      await schedulerService.tick(new Date("2026-06-01T12:01:00.000Z"));

      const states = await schedulerService.listStates();

      expect(states.find((state) => state.taskId === "missing-task")).toBeUndefined();
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("supports run now on a template by creating and queueing a generated task", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Run template now",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T12:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });
      const generated = await taskService.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-01T12:30:00.000Z",
        triggerSource: "template",
      });

      if (!generated) {
        throw new Error("Expected generated task.");
      }

      const run = await executionService.queue(generated.id, {
        triggerSource: "template",
        metadata: { templateId: template.id },
      });

      await expect
        .poll(async () => (await taskService.getRunById(run.id))?.status)
        .toBe("completed");
      const queued = await taskService.get(generated.id);

      expect(queued?.sourceTemplateId).toBe(template.id);
      expect(queued?.status).toBe("ready_to_check");
    } finally {
      await testDb.cleanup();
    }
  });

  it("keeps generated task rescheduling independent from template recurrence", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Independent recurrence",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T12:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "day", interval: 1 },
        },
      });
      const generated = await taskService.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-02T12:00:00.000Z",
        triggerSource: "template",
      });

      if (!generated) {
        throw new Error("Expected generated task.");
      }

      await taskService.update(generated.id, {
        status: "scheduled",
        scheduledAt: "2026-06-03T12:00:00.000Z",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("archives done tasks after the default retention window", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Archive done",
        status: "ready_to_check",
      });

      await taskService.acceptTask(task.id);
      await schedulerService.tick(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
      const archived = await taskService.get(task.id);

      expect(archived).toBeUndefined();
      expect(await taskService.get(task.id, { includeArchived: true })).toMatchObject({
        status: "archived",
      });
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("uses configured done task auto-archive retention", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      await upsertSetting(testDb.client.db, "taskDoneAutoArchiveWeeks", 2);
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Archive later",
        status: "ready_to_check",
      });

      await taskService.acceptTask(task.id);
      await schedulerService.tick(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
      const stillVisible = await taskService.get(task.id);

      expect(stillVisible?.status).toBe("done");
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
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekdays",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] },
        },
      });

      await schedulerService.tick(new Date("2026-06-08T12:00:00.000Z"));

      const runs = await taskService.listRuns(template.id);
      await expect
        .poll(
          async () =>
            (await schedulerService.listStates()).find((state) => state.taskId === template.id)
              ?.nextRunAt,
        )
        .toBe("2026-06-09T09:00:00.000Z");

      expect(runs).toHaveLength(1);
      expect(runs[0]?.renderedContext?.["triggerMetadata"]).toMatchObject({
        scheduledAt: "2026-06-08T09:00:00.000Z",
      });
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("runs one catch-up occurrence when an hourly task is five days overdue", async () => {
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
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Hourly catch-up",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "hour", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2026-06-06T14:30:00.000Z"));

      await expect
        .poll(async () => (await taskService.listRuns(template.id))[0]?.status)
        .toBe("completed");
      const runs = await taskService.listRuns(template.id);

      expect(runs).toHaveLength(1);
      expect(runs[0]?.renderedContext?.["triggerMetadata"]).toMatchObject({
        scheduledAt: "2026-06-06T14:00:00.000Z",
      });
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("computes the true latest hourly catch-up occurrence beyond the old attempt cap", async () => {
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
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Long overdue hourly catch-up",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "hour", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2027-06-01T12:30:00.000Z"));

      await expect
        .poll(async () => (await taskService.listRuns(template.id))[0]?.status)
        .toBe("completed");
      const runs = await taskService.listRuns(template.id);

      expect(runs).toHaveLength(1);
      expect(runs[0]?.renderedContext?.["triggerMetadata"]).toMatchObject({
        scheduledAt: "2027-06-01T12:00:00.000Z",
      });
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("records an error run when scheduled trigger setup fails", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = {
      trigger: vi.fn().mockRejectedValue(new Error("Trigger setup failed.")),
      queue: vi.fn().mockRejectedValue(new Error("Trigger setup failed.")),
      runQueuedTask: vi.fn(),
      cancel: vi.fn(),
      listActiveRuns: vi.fn(),
    } as unknown as TaskExecutionService;
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Failing scheduled task",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "hour", interval: 1 },
        },
      });

      await schedulerService.tick(new Date("2026-06-01T10:30:00.000Z"));

      const runs = await taskService.listRuns(template.id);

      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("error");
      expect(runs[0]?.triggerSource).toBe("scheduled");
      expect(runs[0]?.errorMessage).toBe("Trigger setup failed.");
      expect(runs[0]?.errorDetails).toEqual({ errorName: "Error", stage: "scheduled_trigger" });
      expect(runs[0]?.renderedContext?.["triggerMetadata"]).toMatchObject({
        scheduledAt: "2026-06-01T10:00:00.000Z",
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
