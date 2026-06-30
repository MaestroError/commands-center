import { describe, expect, it } from "vitest";
import { persistedTaskRunArtifactSchema, taskRunArtifactSchema } from "@cc/shared/schemas";
import { eq } from "drizzle-orm";

import type { AppDb } from "../../src/db/client";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";
import { agents, task_runs, task_templates } from "../../src/db/schema/index";

describe("createTaskService", () => {
  it("creates backlog and scheduled tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const manual = await service.create({
        agentId: agent.id,
        title: "Manual release notes",
        description: "Draft release notes.",
        todos: [{ content: "Collect merged PRs" }],
      });
      const scheduled = await service.create({
        agentId: agent.id,
        title: "One-time reminder",
        scheduledAt: "2026-06-01T12:00:00.000Z",
        dueAt: "2026-06-01T18:00:00.000Z",
      });

      expect(manual.status).toBe("backlog");
      expect(manual.todos[0]?.id).toBeDefined();
      expect(scheduled.status).toBe("scheduled");
      expect(scheduled.scheduledAt).toBe("2026-06-01T12:00:00.000Z");
      expect(scheduled.dueAt).toBe("2026-06-01T18:00:00.000Z");
    } finally {
      await testDb.cleanup();
    }
  });

  it("clears a scheduled task back to backlog", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Scheduled task",
        scheduledAt: "2026-06-01T12:00:00.000Z",
      });

      const updated = await service.update(task.id, { scheduledAt: null });

      expect(updated?.status).toBe("backlog");
      expect(updated?.scheduledAt).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects tasks for missing or archived agents", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      await expect(service.create({ agentId: "missing", title: "Invalid agent" })).rejects.toThrow(
        "Task agent must exist and be active",
      );

      const archivedAgent = await insertAgent(testDb.client.db, { status: "archived" });
      await expect(
        service.create({
          agentId: archivedAgent.id,
          title: "Archived agent task",
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
      const listed = await service.list({ status: "backlog" });
      const deleted = await service.delete(created.id);
      const afterDelete = await service.get(created.id);

      expect(updated?.title).toBe("Triage support issues");
      expect(updated?.todos[0]?.completedAt).toBeDefined();
      expect(updated?.permissionProfile?.approvalPolicy).toBe("auto_approve");
      expect(disabled?.status).toBe("disabled");
      expect(enabled?.status).toBe("backlog");
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
        permissionProfile: { approvalPolicy: "auto_approve" },
      });

      await service.createRun({
        taskId: created.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      const duplicated = await service.duplicate(created.id);

      expect(duplicated?.id).not.toBe(created.id);
      expect(duplicated?.title).toBe("Weekly status copy");
      expect(duplicated?.description).toBe("Summarize #status.md.");
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
      });

      await expect(service.create({ agentId: agent.id, title: "Second" })).rejects.toThrow(
        "Maximum task limit reached",
      );
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
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });

      await service.delete(template.id);
      await expect(
        service.create({ agentId: agent.id, title: "Replacement" }),
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
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const task = await service.create({
        agentId: agent.id,
        title: "Manual task",
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
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
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
      expect(storedTemplate?.id).toBe(template.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("clears template recurrence when updated with a null schedule", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      expect(template.recurrence?.mode).toBe("recurring");
      expect(template.nextOccurrenceAt).toBeDefined();

      const updated = await service.updateTemplate(template.id, { recurrence: null });

      expect(updated?.recurrence).toBeUndefined();
      expect(updated?.nextOccurrenceAt).toBeUndefined();

      // An omitted recurrence still leaves any existing schedule untouched.
      const reRepeated = await service.updateTemplate(template.id, {
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-07-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const titleOnly = await service.updateTemplate(reRepeated!.id, { title: "Renamed" });
      expect(titleOnly?.recurrence?.anchorAt).toBe("2026-07-01T09:00:00.000Z");
    } finally {
      await testDb.cleanup();
    }
  });

  it("toggles template active status without touching the schedule", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      expect(template.enabled).toBe(true);

      const disabled = await service.disableTemplate(template.id);
      expect(disabled?.enabled).toBe(false);
      // Disabling must preserve recurrence and the next occurrence.
      expect(disabled?.recurrence?.anchorAt).toBe("2026-06-01T09:00:00.000Z");
      expect(disabled?.nextOccurrenceAt).toBeDefined();

      const enabled = await service.enableTemplate(template.id);
      expect(enabled?.enabled).toBe(true);
      expect(enabled?.recurrence?.anchorAt).toBe("2026-06-01T09:00:00.000Z");

      expect(await service.enableTemplate("missing")).toBeUndefined();
      expect(await service.disableTemplate("missing")).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("toggles template active status without changing template content", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        model: "openai/gpt-4.1",
        fallbackModels: ["anthropic/claude-sonnet-4"],
        title: "Review pull requests",
        description: "Review one eligible pull request.",
        todos: [{ content: "Post review comments" }],
        enabled: false,
      });

      const enabled = await service.enableTemplate(template.id);
      const disabled = await service.disableTemplate(template.id);

      expect(enabled?.description).toBe("Review one eligible pull request.");
      expect(enabled?.todos.map((todo) => todo.content)).toEqual(["Post review comments"]);
      expect(enabled?.fallbackModels).toEqual(["anthropic/claude-sonnet-4"]);
      expect(disabled?.description).toBe("Review one eligible pull request.");
      expect(disabled?.todos.map((todo) => todo.content)).toEqual(["Post review comments"]);
      expect(disabled?.fallbackModels).toEqual(["anthropic/claude-sonnet-4"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("refuses to generate from a disabled template unless explicitly allowed", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
      });
      await service.disableTemplate(template.id);

      // Automation / agent / API entry points pass no override and are refused.
      await expect(
        service.createTaskFromTemplate(template.id, { triggerSource: "agent" }),
      ).rejects.toThrow(/disabled/i);

      // Human UI override still works.
      const task = await service.createTaskFromTemplate(template.id, {
        triggerSource: "manual",
        allowDisabled: true,
      });
      expect(task?.sourceTemplateId).toBe(template.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("ignores legacy archived flags on active task templates", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Legacy archived template",
        description: "Should still be runnable.",
        enabled: true,
      });

      await testDb.client.db
        .update(task_templates)
        .set({ archived: true, archived_at: new Date("2026-06-01T12:00:00.000Z") })
        .where(eq(task_templates.id, template.id));

      const listed = await service.listTemplates();
      const storedTemplate = await service.getTemplate(template.id);
      const generatedTask = await service.createTaskFromTemplate(template.id, {
        triggerSource: "template",
      });

      expect(listed.map((entry) => entry.id)).toContain(template.id);
      expect(storedTemplate?.id).toBe(template.id);
      expect(generatedTask?.sourceTemplateId).toBe(template.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes task templates that do not have proxy task rows", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Reusable report",
        description: "Summarize recent changes.",
        enabled: true,
      });

      const deleted = await service.delete(template.id);
      const storedTemplate = await service.getTemplate(template.id);

      expect(deleted).toBe(true);
      expect(storedTemplate).toBeUndefined();
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

  it("creates and lists pending followups for a run with an existing session", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Follow up" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });

      const first = await service.createFollowup(run.id, { body: "Please add logs." });
      const second = await service.createFollowup(run.id, {
        body: "Should I retry option B?",
        kind: "review_answer",
      });
      const listed = await service.listFollowups(run.id);
      const pending = await service.listPendingFollowups(run.id);

      expect(first.kind).toBe("operator_reply");
      expect(second.kind).toBe("review_answer");
      expect(listed.map((followup) => followup.id)).toEqual([first.id, second.id]);
      expect(pending.map((followup) => followup.status)).toEqual(["pending", "pending"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects followups for runs without an OpenCode session", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "No session" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await expect(service.createFollowup(run.id, { body: "Please continue." })).rejects.toThrow(
        "Task run does not have an OpenCode session.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates pending followups", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Edit followup" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const followup = await service.createFollowup(run.id, { body: "First body." });
      const updated = await service.updateFollowup(run.id, followup.id, {
        body: "Updated body.",
      });

      expect(updated?.body).toBe("Updated body.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not update followups from another run", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Scoped followup edit" });
      const firstRun = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the first task.",
      });
      const secondRun = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-2",
        renderedPrompt: "Do the second task.",
      });
      const followup = await service.createFollowup(firstRun.id, { body: "First body." });

      const updated = await service.updateFollowup(secondRun.id, followup.id, {
        body: "Wrong run.",
      });
      const followups = await service.listFollowups(firstRun.id);

      expect(updated).toBeUndefined();
      expect(followups[0]?.body).toBe("First body.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes pending followups", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Delete followup" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const followup = await service.createFollowup(run.id, { body: "Remove me." });

      await expect(service.deleteFollowup(run.id, followup.id)).resolves.toBe(true);
      await expect(service.listFollowups(run.id)).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not delete followups from another run", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Scoped followup delete" });
      const firstRun = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the first task.",
      });
      const secondRun = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-2",
        renderedPrompt: "Do the second task.",
      });
      const followup = await service.createFollowup(firstRun.id, { body: "Keep me." });

      await expect(service.deleteFollowup(secondRun.id, followup.id)).resolves.toBe(false);
      await expect(service.listFollowups(firstRun.id)).resolves.toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects editing sent followups", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Sent followup" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const followup = await service.createFollowup(run.id, { body: "Keep me." });
      await service.markFollowupsSent([followup.id], "2026-06-01T12:00:00.000Z");

      await expect(service.updateFollowup(run.id, followup.id, { body: "Nope." })).rejects.toThrow(
        "Only pending follow-ups can be edited.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects deleting sent followups", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Sent followup delete" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const followup = await service.createFollowup(run.id, { body: "Keep me." });
      await service.markFollowupsSent([followup.id], "2026-06-01T12:00:00.000Z");

      await expect(service.deleteFollowup(run.id, followup.id)).rejects.toThrow(
        "Only pending follow-ups can be deleted.",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("marks followups sent and failed", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Followup states" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const sent = await service.createFollowup(run.id, { body: "Deliver me." });
      const failed = await service.createFollowup(run.id, { body: "I failed." });

      const [sentFollowup] = await service.markFollowupsSent([sent.id], "2026-06-01T12:00:00.000Z");
      const failedFollowup = await service.markFollowupFailed(failed.id, "transport failed");
      const pending = await service.listPendingFollowups(run.id);

      expect(sentFollowup?.status).toBe("sent");
      expect(sentFollowup?.sentAt).toBe("2026-06-01T12:00:00.000Z");
      expect(failedFollowup?.status).toBe("failed");
      expect(failedFollowup?.errorMessage).toBe("transport failed");
      expect(pending).toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not mark non-pending followups sent", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Followup sent guard" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const pending = await service.createFollowup(run.id, { body: "Deliver me." });
      const failed = await service.createFollowup(run.id, { body: "I failed." });
      const sent = await service.createFollowup(run.id, { body: "Already sent." });
      await service.markFollowupFailed(failed.id, "transport failed");
      await service.markFollowupsSent([sent.id], "2026-06-01T11:00:00.000Z");

      const marked = await service.markFollowupsSent(
        [pending.id, failed.id, sent.id],
        "2026-06-01T12:00:00.000Z",
      );
      const followups = await service.listFollowups(run.id);

      expect(marked.map((followup) => followup.id)).toEqual([pending.id]);
      expect(followups.find((followup) => followup.id === failed.id)?.status).toBe("failed");
      expect(followups.find((followup) => followup.id === failed.id)?.errorMessage).toBe(
        "transport failed",
      );
      expect(followups.find((followup) => followup.id === sent.id)?.sentAt).toBe(
        "2026-06-01T11:00:00.000Z",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not mark non-pending followups failed", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Followup failed guard" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });
      const pending = await service.createFollowup(run.id, { body: "Fail me." });
      const sent = await service.createFollowup(run.id, { body: "Already sent." });
      await service.markFollowupsSent([sent.id], "2026-06-01T11:00:00.000Z");

      const failedPending = await service.markFollowupFailed(pending.id, "transport failed");
      const failedSent = await service.markFollowupFailed(sent.id, "late transport failed");
      const followups = await service.listFollowups(run.id);

      expect(failedPending?.status).toBe("failed");
      expect(failedSent).toBeUndefined();
      expect(followups.find((followup) => followup.id === sent.id)?.status).toBe("sent");
      expect(followups.find((followup) => followup.id === sent.id)?.sentAt).toBe(
        "2026-06-01T11:00:00.000Z",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("maps review questions and pending followup counts on runs", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Mapped followups" });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        triggerSource: "manual",
        opencodeSessionId: "session-1",
        renderedPrompt: "Do the task.",
      });

      await testDb.client.db
        .update(task_runs)
        .set({
          review_question_json: JSON.stringify({
            question: "Which option should I ship?",
            suggestedReplies: ["Option A", "Option B"],
          }),
        })
        .where(eq(task_runs.id, run.id));

      const first = await service.createFollowup(run.id, { body: "One" });
      const second = await service.createFollowup(run.id, { body: "Two" });
      await service.markFollowupsSent([first.id], "2026-06-01T12:00:00.000Z");
      const fetched = await service.getRun(task.id, run.id);

      expect(fetched?.reviewQuestion).toEqual({
        question: "Which option should I ship?",
        suggestedReplies: ["Option A", "Option B"],
      });
      expect(fetched?.pendingFollowupCount).toBe(1);
      expect(second.status).toBe("pending");
    } finally {
      await testDb.cleanup();
    }
  });

  it("validates task run artifacts with typed links", () => {
    expect(
      taskRunArtifactSchema.parse({
        title: "Report",
        type: "file",
        link: ".cc/artifacts/report.md",
      }),
    ).toEqual({ title: "Report", type: "file", link: ".cc/artifacts/report.md" });
    expect(() => taskRunArtifactSchema.parse({ title: "Report" })).toThrow();
    expect(() =>
      taskRunArtifactSchema.parse({
        title: "Report",
        type: "url",
        link: ".cc/artifacts/report.md",
      }),
    ).toThrow();
    expect(
      persistedTaskRunArtifactSchema.parse({
        title: "Legacy report",
        path: ".cc/artifacts/report.md",
      }),
    ).toEqual({ title: "Legacy report", type: "file", link: ".cc/artifacts/report.md" });
  });

  it("lets the assigned agent update outcome fields while a run is running", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Run me",
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
        type: "file",
        link: ".cc/artifacts/article.md",
      });
      const reviewed = await service.markRunNeedsHumanReview(
        run.id,
        agent.id,
        "Send the post manually.",
      );

      expect(reviewed.resultText).toBe("Done with details.");
      expect(reviewed.artifacts).toEqual([
        { title: "Article", type: "file", link: ".cc/artifacts/article.md" },
      ]);
      expect(reviewed.needsHumanReview).toBe(true);
      expect(reviewed.humanReviewReason).toBe("Send the post manually.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("persists review questions when marking a run for human review", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Question run",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      const reviewed = await service.markRunNeedsHumanReview(
        run.id,
        agent.id,
        "Need an operator decision.",
        "Which option should I ship?",
        ["Option A", "Option B"],
      );
      const fetched = await service.getRun(task.id, run.id);

      expect(reviewed.reviewQuestion).toEqual({
        question: "Which option should I ship?",
        suggestedReplies: ["Option A", "Option B"],
      });
      expect(fetched?.reviewQuestion).toEqual({
        question: "Which option should I ship?",
        suggestedReplies: ["Option A", "Option B"],
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects oversized suggested replies when marking a run for human review", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Invalid review question",
      });
      const run = await service.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do the task.",
      });

      await expect(
        service.markRunNeedsHumanReview(run.id, agent.id, "Need input.", "Pick one.", [
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
        ]),
      ).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("snapshots the session summary and the explicit result separately on the task", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);

      // Run where the agent set an explicit result via the MCP tool: the session
      // summary and the explicit result are kept as distinct fields.
      const withResult = await service.create({ agentId: agent.id, title: "Explicit result" });
      const resultRun = await service.createRun({
        taskId: withResult.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do it.",
      });
      await service.setRunResultText(resultRun.id, agent.id, "Explicit agent result.");
      await service.setRunStatus(resultRun.id, "completed", {
        finalMessage: "Last assistant message.",
      });
      const withResultTask = await service.get(withResult.id);
      expect(withResultTask?.latestFinalMessage).toBe("Last assistant message.");
      expect(withResultTask?.latestResultText).toBe("Explicit agent result.");

      // Run without an explicit result: only the session summary is recorded.
      const withoutResult = await service.create({ agentId: agent.id, title: "No result" });
      const summaryRun = await service.createRun({
        taskId: withoutResult.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do it.",
      });
      await service.setRunStatus(summaryRun.id, "completed", {
        finalMessage: "Last assistant message.",
      });
      const withoutResultTask = await service.get(withoutResult.id);
      expect(withoutResultTask?.latestFinalMessage).toBe("Last assistant message.");
      expect(withoutResultTask?.latestResultText).toBeUndefined();

      // A later run on the same task that sets no result clears the stale snapshot.
      const followUpRun = await service.createRun({
        taskId: withResult.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Do it again.",
      });
      await service.setRunStatus(followUpRun.id, "completed", {
        finalMessage: "A newer message without a result.",
      });
      const refreshed = await service.get(withResult.id);
      expect(refreshed?.latestFinalMessage).toBe("A newer message without a result.");
      expect(refreshed?.latestResultText).toBeUndefined();
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
          type: "file",
          link: ".cc/artifacts/first.md",
        }),
        service.addRunArtifact(run.id, agent.id, {
          title: "Second artifact",
          type: "file",
          link: ".cc/artifacts/second.md",
        }),
      ]);

      const updated = await service.getRun(task.id, run.id);

      expect(updated?.artifacts).toEqual([
        { title: "First artifact", type: "file", link: ".cc/artifacts/first.md" },
        { title: "Second artifact", type: "file", link: ".cc/artifacts/second.md" },
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
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        description: "Use the old prompt.",
        todos: [{ content: "Read metrics" }],
        recurrence: {
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

  it("round-trips a task model and carries the template model into generated tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);

      // Task-level model round-trips through create/update (and clears with null).
      const task = await service.create({
        agentId: agent.id,
        model: "anthropic/claude-haiku",
        title: "Cheap task",
        description: "Do a simple thing.",
      });
      expect(task.model).toBe("anthropic/claude-haiku");

      const cleared = await service.update(task.id, { model: null });
      expect(cleared?.model).toBeUndefined();

      // Template model carries into a generated occurrence.
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        model: "anthropic/claude-haiku",
        title: "Templated",
        description: "From a template.",
      });
      expect(template.model).toBe("anthropic/claude-haiku");

      const occurrence = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-08T09:00:00.000Z",
        triggerSource: "template",
      });
      expect(occurrence?.model).toBe("anthropic/claude-haiku");
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns the existing generated task for duplicate template occurrences", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
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
      expect(second?.title).toBe("Weekly report #S1");
      expect(occurrences).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("increments generated task titles for a task template", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Write post",
      });

      const first = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-08T09:00:00.000Z",
        triggerSource: "manual",
      });
      const second = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-09T09:00:00.000Z",
        triggerSource: "manual",
      });

      expect(first?.title).toBe("Write post #M1");
      expect(second?.title).toBe("Write post #M2");
    } finally {
      await testDb.cleanup();
    }
  });

  it("uses the trigger source letter in generated task titles", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Write post",
      });

      const apiTask = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-08T09:00:00.000Z",
        triggerSource: "api",
      });
      const agentTask = await service.createTaskFromTemplate(template.id, {
        occurrenceAt: "2026-06-09T09:00:00.000Z",
        triggerSource: "agent",
      });

      expect(apiTask?.title).toBe("Write post #A1");
      expect(agentTask?.title).toBe("Write post #G2");
    } finally {
      await testDb.cleanup();
    }
  });

  it("maps the generating specialist on generated tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const generatingAgent = await insertAgent(testDb.client.db, {
        id: "agent-generator",
        slug: "generator",
      });
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Write post",
      });

      const generated = await service.createTaskFromTemplate(template.id, {
        triggerSource: "agent",
        generatedByAgentId: generatingAgent.id,
      });

      expect(generated?.generatedByAgentId).toBe(generatingAgent.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates task occurrences with the template default agent", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Weekly report",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });
      const occurrence = await service.createTaskFromTemplate(template.id);

      expect(occurrence?.agentId).toBe(agent.id);
      expect(occurrence?.defaultAgentId).toBe(agent.id);
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

  it("creates feedback subtasks for the default agent when no agent is mentioned", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const defaultAgent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        defaultAgentId: defaultAgent.id,
        title: "Review copy",
      });

      const feedback = await service.createFeedback(task.id, { body: "Check the landing copy." });
      const refreshed = await service.get(task.id);

      expect(feedback.targetAgentIds).toEqual([defaultAgent.id]);
      expect(feedback.subtasks).toEqual([
        expect.objectContaining({
          agentId: defaultAgent.id,
          description: "Check the landing copy.",
          status: "backlog",
          replies: [],
        }),
      ]);
      expect(refreshed?.status).toBe(task.status);
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates one feedback subtask for the mentioned agent", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const mentionedAgent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Check integrations" });

      const feedback = await service.createFeedback(task.id, {
        body: "Please verify the integration contract.",
        mentionedAgentIds: [mentionedAgent.id],
      });

      expect(feedback.targetAgentIds).toEqual([mentionedAgent.id]);
      expect(feedback.subtasks.map((subtask) => subtask.agentId)).toEqual([mentionedAgent.id]);
      expect(new Set(feedback.subtasks.map((subtask) => subtask.feedbackId))).toEqual(
        new Set([feedback.id]),
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("lists feedback with subtask run replies and derived status", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Check feedback" });
      const feedback = await service.createFeedback(task.id, { body: "Retest the fix." });
      const subtaskId = feedback.subtasks[0]?.id;

      if (!subtaskId) throw new Error("Expected feedback subtask.");

      const firstRun = await service.queueTask({
        taskId: task.id,
        subtaskId,
        triggerSource: "manual",
        renderedPrompt: "Retest once.",
      });
      await service.setRunStatus(firstRun.id, "completed", { outcome: "needs_human_review" });
      const secondRun = await service.queueTask({
        taskId: task.id,
        subtaskId,
        triggerSource: "manual",
        renderedPrompt: "Retest again.",
      });
      await service.setRunStatus(secondRun.id, "completed", { finalMessage: "Looks good." });

      const [thread] = await service.listFeedback(task.id);

      expect(thread?.subtasks[0]).toMatchObject({
        id: subtaskId,
        status: "done",
        latestRun: { id: secondRun.id },
      });
      expect(thread?.subtasks[0]?.replies).toEqual([
        expect.objectContaining({
          run: expect.objectContaining({ id: firstRun.id }),
          status: "review",
        }),
        expect.objectContaining({
          run: expect.objectContaining({ id: secondRun.id }),
          status: "done",
        }),
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("updates feedback bodies and derived subtask descriptions before any subtask run starts", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Update feedback" });
      const feedback = await service.createFeedback(task.id, { body: "Old feedback." });
      const updated = await service.updateFeedback(task.id, feedback.id, { body: "New feedback." });

      expect(updated?.body).toBe("New feedback.");
      expect(updated?.subtasks[0]?.description).toBe("New feedback.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects feedback edits after a derived subtask run has started", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Locked feedback" });
      const feedback = await service.createFeedback(task.id, { body: "Old feedback." });
      const subtaskId = feedback.subtasks[0]?.id;

      if (!subtaskId) {
        throw new Error("Expected feedback subtask.");
      }

      await service.queueTask({
        taskId: task.id,
        subtaskId,
        triggerSource: "manual",
        renderedPrompt: "Review the feedback.",
      });

      await expect(
        service.updateFeedback(task.id, feedback.id, { body: "New feedback." }),
      ).rejects.toThrow("Feedback cannot be edited after a subtask run has started.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("summarizes subtask progress across tasks", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({ agentId: agent.id, title: "Measure progress" });
      const backlogSubtask = await service.createSubtask(task.id, {
        agentId: agent.id,
        description: "Still pending.",
      });
      const completedSubtask = await service.createSubtask(task.id, {
        agentId: agent.id,
        description: "Completed.",
      });
      const activeSubtask = await service.createSubtask(task.id, {
        agentId: agent.id,
        description: "Running.",
      });
      const reviewSubtask = await service.createSubtask(task.id, {
        agentId: agent.id,
        description: "Needs review.",
      });
      await service.createRun({
        taskId: task.id,
        subtaskId: completedSubtask.id,
        agentId: agent.id,
        status: "completed",
        triggerSource: "manual",
      });
      await service.createRun({
        taskId: task.id,
        subtaskId: activeSubtask.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
      });
      await service.createRun({
        taskId: task.id,
        subtaskId: reviewSubtask.id,
        agentId: agent.id,
        status: "failed",
        triggerSource: "manual",
      });

      const progress = await service.listSubtaskProgress([task.id, task.id]);

      expect(progress).toEqual([
        {
          taskId: task.id,
          total: 4,
          completed: 1,
          active: 1,
          review: 0,
          failed: 1,
          subtasks: [
            expect.objectContaining({ id: backlogSubtask.id, status: "backlog" }),
            expect.objectContaining({ id: completedSubtask.id, status: "done" }),
            expect.objectContaining({ id: activeSubtask.id, status: "running" }),
            expect.objectContaining({ id: reviewSubtask.id, status: "failed" }),
          ],
        },
      ]);
      expect(backlogSubtask.id).toBeDefined();
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

  it("keeps parent task queued while feedback subtasks remain pending", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const parentAgent = await insertAgent(testDb.client.db);
      const firstSubtaskAgent = await insertAgent(testDb.client.db);
      const secondSubtaskAgent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: parentAgent.id,
        title: "Queued parent",
        status: "backlog",
      });
      const firstFeedback = await service.createFeedback(task.id, {
        body: "Handle both feedback items.",
        mentionedAgentIds: [firstSubtaskAgent.id],
      });
      await service.createFeedback(task.id, {
        body: "Handle the second feedback item.",
        mentionedAgentIds: [secondSubtaskAgent.id],
      });
      const firstRun = await service.queueTask({
        taskId: task.id,
        subtaskId: firstFeedback.subtasks[0]?.id,
        triggerSource: "manual",
      });

      await service.setRunStatus(firstRun.id, "completed", { finalMessage: "First done." });

      const updated = await service.get(task.id);

      expect(updated?.status).toBe("queued");
      expect(updated?.latestFinalMessage).toBe("First done.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("moves parent task to failed when any feedback subtask fails", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const parentAgent = await insertAgent(testDb.client.db);
      const firstSubtaskAgent = await insertAgent(testDb.client.db);
      const secondSubtaskAgent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: parentAgent.id,
        title: "Review parent",
        status: "backlog",
      });
      const firstFeedback = await service.createFeedback(task.id, {
        body: "Handle review feedback.",
        mentionedAgentIds: [firstSubtaskAgent.id],
      });
      const secondFeedback = await service.createFeedback(task.id, {
        body: "Handle second review feedback.",
        mentionedAgentIds: [secondSubtaskAgent.id],
      });
      const firstRun = await service.queueTask({
        taskId: task.id,
        subtaskId: firstFeedback.subtasks[0]?.id,
        triggerSource: "manual",
      });
      const secondRun = await service.queueTask({
        taskId: task.id,
        subtaskId: secondFeedback.subtasks[0]?.id,
        triggerSource: "manual",
      });

      await service.setRunStatus(firstRun.id, "failed", { errorMessage: "Failed." });
      await service.setRunStatus(secondRun.id, "completed", { finalMessage: "Second done." });

      const updated = await service.get(task.id);

      expect(updated?.status).toBe("failed");
    } finally {
      await testDb.cleanup();
    }
  });

  it("moves failed runs to failed", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await service.create({
        agentId: agent.id,
        title: "Review failure",
        status: "backlog",
      });
      const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });

      await service.setRunStatus(run.id, "failed", { errorMessage: "Could not finish." });
      const updated = await service.get(task.id);

      expect(updated?.status).toBe("failed");
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
      name: overrides.name ?? "Task Specialist",
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
