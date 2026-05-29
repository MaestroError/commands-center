import { describe, expect, it } from "vitest";
import { taskRunArtifactSchema } from "@cc/shared/schemas";
import { eq } from "drizzle-orm";

import type { AppDb } from "../../src/db/client";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";
import { agents, task_runs } from "../../src/db/schema/index";

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
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
        },
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

  it("duplicates a task without copying runs or enabled state", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const created = await service.create({
        agentId: agent.id,
        title: "Weekly status",
        description: "Summarize #status.md.",
        todos: [{ content: "Read updates", status: "completed" }],
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
        },
        permissionProfile: { approvalPolicy: "auto_approve" },
      });
      const occurrence = await service.createTaskFromTemplate(created.id, {
        triggerSource: "manual",
      });

      if (!occurrence) {
        throw new Error("Expected task occurrence to be created.");
      }

      await service.createRun({
        taskId: occurrence.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      const duplicated = await service.duplicate(created.id);

      expect(duplicated?.id).not.toBe(created.id);
      expect(duplicated?.title).toBe("Weekly status copy");
      expect(duplicated?.description).toBe("Summarize #status.md.");
      expect(duplicated?.schedule).toEqual(created.schedule);
      expect(duplicated?.permissionProfile?.approvalPolicy).toBe("auto_approve");
      expect(duplicated?.enabled).toBe(false);
      expect(duplicated?.status).toBe("disabled");
      expect(duplicated?.todos[0]?.id).not.toBe(created.todos[0]?.id);
      expect(duplicated?.todos[0]?.content).toBe("Read updates");
      expect(duplicated?.latestFinalMessage).toBeUndefined();
      await expect(service.listRuns(duplicated?.id ?? "missing")).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns undefined when duplicating a missing task", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      await expect(service.duplicate("missing")).resolves.toBeUndefined();
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
      const first = await service.create({
        agentId: agent.id,
        title: "First",
        triggerMode: "manual",
      });

      await expect(
        service.create({ agentId: agent.id, title: "Second", triggerMode: "manual" }),
      ).rejects.toThrow("Maximum task limit reached");
      await expect(service.duplicate(first.id)).rejects.toThrow("Maximum task limit reached");
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes deleted task templates from the configured max task limit", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({
      db: testDb.client.db,
      config: { ...testDb.config, tasks: { maxTasks: 1 } },
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.create({
        agentId: agent.id,
        title: "Weekly report",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });

      await service.delete(template.id);
      await expect(
        service.create({ agentId: agent.id, title: "Replacement", triggerMode: "manual" }),
      ).resolves.toMatchObject({ title: "Replacement" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("excludes task templates from task and archive lists", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.create({
        agentId: agent.id,
        title: "Weekly report",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const task = await service.create({
        agentId: agent.id,
        title: "Manual task",
        triggerMode: "manual",
      });

      await service.archive(task.id);
      const listed = await service.list({ includeArchived: true });
      const archived = await service.listArchived();

      expect(listed.map((entry) => entry.id)).not.toContain(template.id);
      expect(archived.map((entry) => entry.id)).toEqual([task.id]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not archive or restore task templates", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.create({
        agentId: agent.id,
        title: "Weekly report",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });

      const archived = await service.archive(template.id);
      const restored = await service.restore(template.id);
      const storedTemplate = await service.getTemplate(template.id);

      expect(archived).toBeUndefined();
      expect(restored).toBeUndefined();
      expect(storedTemplate?.archived).toBe(false);
      expect(storedTemplate?.status).toBe("enabled");
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
        context: { text: "Use release branch." },
        renderedPrompt: "Do the task.",
        renderedContext: { title: task.title },
        effectivePermissions: { approvalPolicy: "auto_approve" },
      });
      const updated = await service.updateRun(run.id, {
        status: "completed",
        finalMessage: "Task finished.",
        completedAt: "2026-06-01T12:00:00.000Z",
      });
      const runs = await service.listRuns(task.id, { status: "completed" });
      const fetched = await service.getRun(task.id, run.id);

      expect(updated?.status).toBe("completed");
      expect(runs).toHaveLength(1);
      expect(fetched?.context).toEqual({ text: "Use release branch." });
      expect(fetched?.renderedContext).toEqual({ title: task.title });
      expect(fetched?.effectivePermissions?.approvalPolicy).toBe("auto_approve");
      expect(fetched?.finalMessage).toBe("Task finished.");
      expect(fetched?.artifacts).toEqual([]);
      expect(fetched?.needsHumanReview).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("maps legacy null task run outcome fields to defaults", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Legacy run",
        triggerMode: "manual",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await testDb.client.db
        .update(task_runs)
        .set({
          artifacts_json: null as unknown as string,
          needs_human_review: null as unknown as boolean,
        })
        .where(eq(task_runs.id, run.id));

      const runs = await service.listRuns(task.id);

      expect(runs[0]?.artifacts).toEqual([]);
      expect(runs[0]?.needsHumanReview).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("validates task run artifacts with exactly one locator", () => {
    expect(
      taskRunArtifactSchema.parse({ title: "Report", path: ".cc/artifacts/report.md" }),
    ).toEqual({ title: "Report", path: ".cc/artifacts/report.md" });
    expect(() => taskRunArtifactSchema.parse({ title: "Report" })).toThrow(
      "Exactly one of url or path is required.",
    );
    expect(() =>
      taskRunArtifactSchema.parse({
        title: "Report",
        url: "https://example.com/report",
        path: ".cc/artifacts/report.md",
      }),
    ).toThrow("Exactly one of url or path is required.");
  });

  it("lets the assigned agent update outcome fields while a run is running", async () => {
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
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await service.setRunResultText(run.id, agent.id, "Done with details.");
      await service.addRunArtifact(run.id, agent.id, {
        title: "Article",
        path: ".cc/artifacts/article.md",
      });
      const reviewed = await service.markRunNeedsHumanReview(
        run.id,
        agent.id,
        "Send the post manually.",
      );

      expect(reviewed.resultText).toBe("Done with details.");
      expect(reviewed.artifacts).toEqual([{ title: "Article", path: ".cc/artifacts/article.md" }]);
      expect(reviewed.needsHumanReview).toBe(true);
      expect(reviewed.humanReviewReason).toBe("Send the post manually.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves parallel artifact appends", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Collect artifacts",
        triggerMode: "manual",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await Promise.all([
        service.addRunArtifact(run.id, agent.id, {
          title: "First artifact",
          path: ".cc/artifacts/first.md",
        }),
        service.addRunArtifact(run.id, agent.id, {
          title: "Second artifact",
          path: ".cc/artifacts/second.md",
        }),
      ]);

      const updated = await service.getRun(task.id, run.id);

      expect(updated?.artifacts).toEqual([
        { title: "First artifact", path: ".cc/artifacts/first.md" },
        { title: "Second artifact", path: ".cc/artifacts/second.md" },
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects outcome updates for the wrong agent or non-running runs", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const otherAgent = await insertAgent(testDb.client.db, { id: "other-agent", slug: "other" });
      const task = await service.create({
        agentId: agent.id,
        title: "Run me",
        triggerMode: "manual",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await expect(service.setRunResultText(run.id, otherAgent.id, "Wrong agent.")).rejects.toThrow(
        "Task run agent must match the calling agent.",
      );

      await service.setRunStatus(run.id, "completed");
      await expect(service.setRunResultText(run.id, agent.id, "Too late.")).rejects.toThrow(
        "Only running task runs can be updated by an agent.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates task occurrences from templates with frozen task data", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.create({
        agentId: agent.id,
        title: "Weekly report",
        description: "Use the old prompt.",
        todos: [{ content: "Read metrics" }],
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const occurrence = await service.createTaskFromTemplate(template.id, {
        scheduledFor: "2026-06-08T09:00:00.000Z",
        triggerSource: "scheduled",
      });

      await service.update(template.id, { description: "Use the new prompt." });

      const storedOccurrence = occurrence ? await service.get(occurrence.id) : undefined;
      const occurrences = await service.listTemplateTasks(template.id);

      expect(storedOccurrence?.templateId).toBeUndefined();
      expect(storedOccurrence?.sourceTemplateId).toBe(template.id);
      expect(storedOccurrence?.sourceOccurrenceAt).toBe("2026-06-08T09:00:00.000Z");
      expect(storedOccurrence?.description).toBe("Use the old prompt.");
      expect(storedOccurrence?.scheduledFor).toBe("2026-06-08T09:00:00.000Z");
      expect(occurrences.map((task) => task.id)).toEqual([occurrence?.id]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns the existing generated task for duplicate template occurrences", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.create({
        agentId: agent.id,
        title: "Weekly report",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const first = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-08T09:00:00.000Z",
        triggerSource: "template",
      });
      const second = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-08T09:00:00.000Z",
        triggerSource: "template",
      });
      const occurrences = await service.listTemplateTasks(template.id);

      expect(second?.id).toBe(first?.id);
      expect(occurrences).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("syncs the template proxy row when updating a task template", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const firstAgent = await insertAgent(testDb.client.db);
      const secondAgent = await insertAgent(testDb.client.db, {
        id: "agent-second",
        slug: "second-agent",
        name: "Second Agent",
      });
      const template = await service.create({
        agentId: firstAgent.id,
        title: "Weekly report",
        triggerMode: "recurring",
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });

      await service.update(template.id, {
        agentId: secondAgent.id,
        title: "Updated weekly report",
      });
      const run = await service.createRun({
        taskId: template.id,
        agentId: secondAgent.id,
        triggerSource: "manual",
        renderedPrompt: "Run the updated template.",
      });

      expect(run.agentId).toBe(secondAgent.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("allows multiple executions for the same task occurrence", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Reviewable task",
        triggerMode: "manual",
      });

      const first = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "First attempt.",
      });
      const second = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Second attempt.",
      });
      const runs = await service.listRuns(task.id);

      expect(runs.map((run) => run.id).sort()).toEqual([first.id, second.id].sort());
      expect(new Set(runs.map((run) => run.taskId))).toEqual(new Set([task.id]));
    } finally {
      await testDb.cleanup();
    }
  });

  it("queues a backlog task and records run metadata", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Queue me",
        triggerMode: "manual",
        status: "backlog",
      });
      const run = await service.queueTask({
        taskId: task.id,
        triggerSource: "api",
        metadata: { requestedBy: "test" },
        renderedPrompt: "Do the queued task.",
      });
      const queued = await service.get(task.id);

      expect(run.status).toBe("queued");
      expect(run.triggerMetadata).toEqual({ requestedBy: "test" });
      expect(queued?.status).toBe("queued");
      expect(queued?.latestRunId).toBe(run.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects duplicate active runs for the same task", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Queue once",
        triggerMode: "manual",
        status: "backlog",
      });

      await service.queueTask({ taskId: task.id, triggerSource: "manual" });
      await expect(service.queueTask({ taskId: task.id, triggerSource: "manual" })).rejects.toThrow(
        "Task already has an active run.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("allows retry after a terminal run", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Retry me",
        triggerMode: "manual",
        status: "backlog",
      });
      const first = await service.queueTask({ taskId: task.id, triggerSource: "manual" });

      await service.setRunStatus(first.id, "completed");
      const second = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
      const runs = await service.listRuns(task.id);

      expect(second.id).not.toBe(first.id);
      expect(runs.map((run) => run.id).sort()).toEqual([first.id, second.id].sort());
    } finally {
      await testDb.cleanup();
    }
  });

  it("moves successful runs to ready to check", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Review success",
        triggerMode: "manual",
        status: "backlog",
      });
      const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });

      await service.setRunStatus(run.id, "completed", { finalMessage: "Finished." });
      const updated = await service.get(task.id);

      expect(updated?.status).toBe("ready_to_check");
      expect(updated?.latestFinalMessage).toBe("Finished.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("moves failed runs to review", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Review failure",
        triggerMode: "manual",
        status: "backlog",
      });
      const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });

      await service.setRunStatus(run.id, "failed", { errorMessage: "Could not finish." });
      const updated = await service.get(task.id);

      expect(updated?.status).toBe("review");
    } finally {
      await testDb.cleanup();
    }
  });

  it("moves human-review outcomes to review", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Needs user",
        triggerMode: "manual",
        status: "backlog",
      });
      const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });

      await service.setRunStatus(run.id, "completed", { outcome: "needs_human_review" });
      const updated = await service.get(task.id);

      expect(updated?.status).toBe("review");
    } finally {
      await testDb.cleanup();
    }
  });

  it("accepts reviewed tasks as done", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Accept me",
        triggerMode: "manual",
        status: "ready_to_check",
      });
      const accepted = await service.acceptTask(task.id);

      expect(accepted?.status).toBe("done");
      expect(accepted?.doneAt).toBeDefined();
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
