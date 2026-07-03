/**
 * Task scheduler recurrence e2e — issue #96 §4
 *
 * Drives createTaskSchedulerService end to end against real SQLite: template →
 * task instantiation, duplicate-occurrence protection across repeated ticks,
 * done-task archival, and tick error recording in the scheduler state. The
 * execution side is a lightweight real service (no OpenCode) so scheduled tasks
 * land in the queue without spawning anything.
 */

import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskSchedulerService } from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

async function insertAgent(db: AppDb): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug: id,
    name: "Scheduler Specialist",
    role: "run scheduled work",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
  return id;
}

function wireScheduler(testDb: TestDb) {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const ref: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
  const executionService = createTaskExecutionService({
    db: testDb.client.db,
    taskService,
    onRunTerminal: (run) => ref.current?.handleRunTerminal(run),
  });
  const scheduler = createTaskSchedulerService({
    db: testDb.client.db,
    taskService,
    executionService,
    tickMs: 5,
  });
  ref.current = scheduler;
  return { taskService, executionService, scheduler };
}

async function makeTestDb(): Promise<TestDb> {
  const testDb = await createTestDatabase();
  cleanups.push(() => testDb.cleanup());
  return testDb;
}

describe("task scheduler recurrence e2e", () => {
  it("queues a past-due scheduled task on the live tick loop", async () => {
    const testDb = await makeTestDb();
    const { taskService, scheduler } = wireScheduler(testDb);

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({
      agentId,
      title: "Overdue board task",
      status: "scheduled",
      scheduledAt: "2026-01-01T00:00:00.000Z",
    });

    scheduler.start();
    try {
      // The scheduled time is in the past, so the live tick loop queues it once.
      await expect.poll(async () => (await taskService.listRuns(task.id)).length).toBe(1);
      expect(scheduler.getStatus().state).toBe("running");
    } finally {
      scheduler.stop();
    }

    expect(scheduler.getStatus().state).toBe("inactive");
  });

  it("does not double-instantiate the same occurrence across repeated ticks", async () => {
    const testDb = await makeTestDb();
    const { taskService, scheduler } = wireScheduler(testDb);

    const agentId = await insertAgent(testDb.client.db);
    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Daily report",
      recurrence: {
        mode: "recurring",
        anchorAt: "2026-06-01T09:00:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "day", interval: 1 },
      },
    });

    const at = new Date("2026-06-03T12:00:00.000Z");
    await scheduler.reconcile(new Date("2026-06-03T08:00:00.000Z"));
    await scheduler.tick(at);
    await scheduler.tick(at);
    await scheduler.tick(at);

    expect(await taskService.listRuns(template.id)).toHaveLength(1);
  });

  it("archives accepted done tasks past the retention window on tick", async () => {
    const testDb = await makeTestDb();
    const { taskService, scheduler } = wireScheduler(testDb);

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({
      agentId,
      title: "Wrap up",
      status: "ready_to_check",
    });
    await taskService.acceptTask(task.id);

    await scheduler.tick(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));

    expect(await taskService.get(task.id)).toBeUndefined();
    expect(await taskService.get(task.id, { includeArchived: true })).toMatchObject({
      status: "archived",
    });
  });

  it("records the tick error on scheduler state when a tick throws", async () => {
    const testDb = await makeTestDb();
    const { taskService, scheduler } = wireScheduler(testDb);

    const spy = vi
      .spyOn(taskService, "list")
      .mockRejectedValueOnce(new Error("db read failed during reconcile"));

    await expect(scheduler.tick(new Date())).rejects.toThrow("db read failed during reconcile");

    const status = scheduler.getStatus();
    expect(status.state).toBe("error");
    expect(status.healthy).toBe(false);
    expect(status.lastError).toBe("db read failed during reconcile");

    spy.mockRestore();
    // A subsequent healthy tick clears the error.
    await scheduler.tick(new Date());
    expect(scheduler.getStatus().lastError).toBeUndefined();
  });
});
