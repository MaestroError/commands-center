import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

describe("createTaskExecutionService", () => {
  it("runs manual tasks through queued, running, and completed states", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Manual task",
        triggerMode: "manual",
      });

      const run = await executionService.trigger(task.id, { triggerSource: "manual" });
      const history = await taskService.listRuns(task.id);

      expect(run.status).toBe("completed");
      expect(run.startedAt).toBeDefined();
      expect(run.completedAt).toBeDefined();
      expect(run.renderedPrompt).toContain("Task: Manual task");
      expect(history).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects manual triggers for disabled tasks", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId: agent.id,
        title: "Disabled task",
        triggerMode: "manual",
        enabled: false,
      });

      await expect(executionService.trigger(task.id, { triggerSource: "manual" })).rejects.toThrow(
        "Task must be enabled before it can run.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("cancels queued task runs", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const executionService = createTaskExecutionService({ taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Cancelable" });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        status: "queued",
      });
      const cancelled = await executionService.cancel(run.id, { reason: "Stop." });

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellationReason).toBe("Stop.");
    } finally {
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
