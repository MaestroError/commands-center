import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";
import { agents } from "../../src/db/schema/index";

describe("createTaskService", () => {
  it("creates manual, one-time, and recurring tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const manual = await service.create({
        agentId: agent.id,
        title: "Manual release notes",
        description: "Draft release notes.",
        context: "Use merged PRs.",
        todos: [{ content: "Collect merged PRs" }],
        triggerMode: "manual",
      });
      const scheduledOnce = await service.create({
        agentId: agent.id,
        title: "One-time reminder",
        triggerMode: "scheduled_once",
        schedule: { mode: "scheduled_once", runAt: "2026-06-01T12:00:00.000Z" },
      });
      const recurring = await service.create({
        agentId: agent.id,
        title: "Weekly status",
        triggerMode: "recurring",
        schedule: { mode: "recurring", cronExpression: "0 9 * * 1", timezone: "UTC" },
        status: "in_progress",
      });

      expect(manual.schedule).toEqual({ mode: "manual" });
      expect(manual.todos[0]?.id).toBeDefined();
      expect(scheduledOnce.schedule.mode).toBe("scheduled_once");
      expect(recurring.status).toBe("in_progress");
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects scheduled tasks without matching schedule definitions", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      await expect(
        service.create({
          agentId: agent.id,
          title: "Missing schedule",
          triggerMode: "scheduled_once",
        }),
      ).rejects.toThrow("Scheduled tasks require a schedule definition");
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects tasks for missing or archived agents", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      await expect(
        service.create({ agentId: "missing", title: "Invalid agent", triggerMode: "manual" }),
      ).rejects.toThrow("Task agent must exist and be active");

      const archivedAgent = await insertAgent(testDb.client.db, { status: "archived" });
      await expect(
        service.create({
          agentId: archivedAgent.id,
          title: "Archived agent task",
          triggerMode: "manual",
        }),
      ).rejects.toThrow("Task agent must exist and be active");
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates, filters, archives, restores, disables, enables, and soft deletes tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const created = await service.create({
        agentId: agent.id,
        title: "Triage issues",
        triggerMode: "manual",
      });
      const updated = await service.update(created.id, {
        title: "Triage support issues",
        todos: [{ content: "Read inbox", status: "completed" }],
        permissionProfile: {
          toolPermissions: [{ pattern: "bash", action: "allow" }],
          approvalPolicy: "auto_approve",
        },
      });
      const disabled = await service.disable(created.id);
      const enabled = await service.enable(created.id);
      const archived = await service.archive(created.id);
      const restored = await service.restore(created.id);
      const listed = await service.list({ status: "enabled" });
      const deleted = await service.delete(created.id);
      const afterDelete = await service.get(created.id);

      expect(updated?.title).toBe("Triage support issues");
      expect(updated?.todos[0]?.completedAt).toBeDefined();
      expect(updated?.permissionProfile?.approvalPolicy).toBe("auto_approve");
      expect(disabled?.status).toBe("disabled");
      expect(enabled?.status).toBe("enabled");
      expect(archived?.status).toBe("archived");
      expect(restored?.archived).toBe(false);
      expect(listed.map((task) => task.id)).toContain(created.id);
      expect(deleted).toBe(true);
      expect(afterDelete).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("enforces the configured max task limit", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({
      db: testDb.client.db,
      config: { ...testDb.config, tasks: { maxTasks: 1 } },
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      await service.create({ agentId: agent.id, title: "First", triggerMode: "manual" });

      await expect(
        service.create({ agentId: agent.id, title: "Second", triggerMode: "manual" }),
      ).rejects.toThrow("Maximum task limit reached");
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates, updates, lists, and retrieves task run metadata", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Run me",
        triggerMode: "manual",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
        renderedContext: { title: task.title },
        effectivePermissions: { approvalPolicy: "auto_approve" },
      });
      const updated = await service.updateRun(run.id, {
        status: "completed",
        resultSummary: "Task finished.",
        completedAt: "2026-06-01T12:00:00.000Z",
      });
      const runs = await service.listRuns(task.id, { status: "completed" });
      const fetched = await service.getRun(task.id, run.id);

      expect(updated?.status).toBe("completed");
      expect(runs).toHaveLength(1);
      expect(fetched?.renderedContext).toEqual({ title: task.title });
      expect(fetched?.effectivePermissions?.approvalPolicy).toBe("auto_approve");
    } finally {
      await testDb.cleanup();
    }
  });
});

async function insertAgent(
  db: AppDb,
  overrides: Partial<typeof agents.$inferInsert> = {},
): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const [agent] = await db
    .insert(agents)
    .values({
      id: overrides.id ?? `agent-${crypto.randomUUID()}`,
      slug: overrides.slug ?? `agent-${crypto.randomUUID()}`,
      name: overrides.name ?? "Task Agent",
      role: overrides.role ?? "help with tasks",
      instructions: overrides.instructions ?? "Be useful.",
      default_model: overrides.default_model ?? "openai/gpt-4.1",
      icon_path: overrides.icon_path ?? null,
      status: overrides.status ?? "active",
      capabilities_json: overrides.capabilities_json ?? "{}",
      created_at: overrides.created_at ?? timestamp,
      updated_at: overrides.updated_at ?? timestamp,
      archived_at: overrides.archived_at ?? null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert test agent.");
  }

  return agent;
}
