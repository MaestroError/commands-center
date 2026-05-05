import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import {
  computeNextCronRun,
  createTaskSchedulerService,
} from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

describe("createTaskSchedulerService", () => {
  it("computes next recurring cron runs", () => {
    const next = computeNextCronRun("*/15 * * * *", new Date("2026-06-01T12:07:00.000Z"));

    expect(next.toISOString()).toBe("2026-06-01T12:15:00.000Z");
  });

  it("runs due one-time scheduled tasks once", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

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
      expect(runs[0]?.status).toBe("completed");
      expect(states.find((state) => state.taskId === task.id)?.nextRunAt).toBeUndefined();
    } finally {
      schedulerService.stop();
      await testDb.cleanup();
    }
  });

  it("runs recurring tasks and advances next run state", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });
    const schedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Recurring",
        triggerMode: "recurring",
        schedule: { mode: "recurring", cronExpression: "*/5 * * * *" },
      });

      await schedulerService.tick(new Date("2026-06-01T12:05:00.000Z"));

      const runs = await taskService.listRuns(task.id);
      const states = await schedulerService.listStates();

      expect(runs).toHaveLength(1);
      expect(states.find((state) => state.taskId === task.id)?.nextRunAt).toBe(
        "2026-06-01T12:10:00.000Z",
      );
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
