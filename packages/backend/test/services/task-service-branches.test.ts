import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function insertAgent(db: AppDb): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug: id,
    name: "Branch Specialist",
    role: "cover branches",
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

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const agentId = await insertAgent(testDb.client.db);
  return { testDb, taskService, agentId };
}

const RECURRENCE = {
  mode: "recurring" as const,
  anchorAt: "2026-06-01T09:00:00.000Z",
  timezone: "UTC",
  repeatRule: { frequency: "day" as const, interval: 1 },
};

describe("task-service branch coverage", () => {
  it("creates templates with full and minimal option sets", async () => {
    const { taskService, agentId } = await setup();

    const full = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Full template",
      description: "Every option set.",
      model: "openai/gpt-4.1",
      fallbackModels: ["anthropic/claude-haiku"],
      todos: [{ content: "Step 1" }, { content: "Step 2" }],
      recurrence: RECURRENCE,
      enabled: false,
    });
    expect(full.enabled).toBe(false);
    expect(full.recurrence?.mode).toBe("recurring");

    const minimal = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Minimal template",
    });
    expect(minimal.enabled).toBe(true);

    const updated = await taskService.updateTemplate(minimal.id, {
      title: "Renamed",
      description: "Now with detail.",
      model: "openai/gpt-4.1",
      enabled: false,
    });
    expect(updated?.title).toBe("Renamed");
    expect(updated?.enabled).toBe(false);

    expect(await taskService.listTemplates({ defaultAgentId: agentId })).toHaveLength(2);
  });

  it("creates and updates tasks across the option matrix", async () => {
    const { taskService, agentId } = await setup();

    const scheduled = await taskService.create({
      agentId,
      title: "Scheduled",
      description: "Runs later.",
      model: "openai/gpt-4.1",
      fallbackModels: ["anthropic/claude-haiku"],
      status: "scheduled",
      scheduledAt: "2027-01-01T00:00:00.000Z",
      dueAt: "2027-01-02T00:00:00.000Z",
      todos: [{ content: "Prep" }],
      context: { text: "Some context" },
    });
    expect(scheduled.status).toBe("scheduled");

    const draft = await taskService.create({ agentId, title: "Draft task", status: "draft" });
    expect(draft.status).toBe("draft");
    expect(draft.enabled).toBe(false);

    const updated = await taskService.update(scheduled.id, {
      title: "Rescheduled",
      description: "Updated goal.",
      model: "anthropic/claude-haiku",
      todos: [{ content: "New step" }],
    });
    expect(updated?.title).toBe("Rescheduled");

    // Enable/disable transitions.
    expect((await taskService.disable(draft.id))?.enabled).toBe(false);
    expect((await taskService.enable(draft.id))?.enabled).toBe(true);
  });

  it("duplicates a task and instantiates a task from a template", async () => {
    const { taskService, agentId } = await setup();

    const original = await taskService.create({
      agentId,
      title: "Duplicate me",
      description: "Has content.",
      todos: [{ content: "A" }],
    });
    const copy = await taskService.duplicate(original.id);
    expect(copy?.title).toContain("Duplicate me");
    expect(copy?.id).not.toBe(original.id);

    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Template source",
      description: "Reusable.",
      recurrence: RECURRENCE,
    });
    const generated = await taskService.createTaskFromTemplate(template.id, {
      occurrenceAt: "2026-06-02T09:00:00.000Z",
      triggerSource: "scheduled",
    });
    expect(generated?.sourceTemplateId).toBe(template.id);
    expect(await taskService.listTemplateTasks(template.id)).toHaveLength(1);
  });

  it("drives run status transitions, results, and artifacts", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "Run transitions" });
    const run = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "queued",
      triggerSource: "manual",
      model: "openai/gpt-4.1",
      fallbackModels: ["anthropic/claude-haiku"],
      renderedPrompt: "Work.",
    });

    const running = await taskService.updateRun(run.id, {
      status: "running",
      opencodeSessionId: "session-1",
    });
    expect(running?.status).toBe("running");

    await taskService.setRunResultText(run.id, agentId, "Interim result");
    const completed = await taskService.setRunStatus(run.id, "completed", {
      completedAt: new Date().toISOString(),
      finalMessage: "All done.",
    });
    expect(completed?.status).toBe("completed");

    const runs = await taskService.listRuns(task.id, { status: "completed" });
    expect(runs).toHaveLength(1);
    expect(await taskService.getRun(task.id, run.id)).toBeDefined();
  });

  it("marks a run as needing human review", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "Review run" });
    const run = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "running",
      triggerSource: "manual",
      opencodeSessionId: "session-1",
      renderedPrompt: "Work.",
    });

    const reviewed = await taskService.markRunNeedsHumanReview(run.id, agentId, "Needs a human.");
    expect(reviewed).toBeDefined();
    // The run itself records the review request; the task's board transition to
    // "review" is owned by the execution service's terminal-run handling.
    expect(await taskService.getRunById(run.id)).toBeDefined();
  });

  it("filters task and run listings", async () => {
    const { taskService, agentId } = await setup();
    await taskService.create({ agentId, title: "Active one" });
    const archived = await taskService.create({ agentId, title: "To archive" });
    await taskService.archive(archived.id);

    expect(await taskService.list({ includeArchived: false })).toHaveLength(1);
    expect(await taskService.list({ includeArchived: true })).toHaveLength(2);
    expect(await taskService.listArchived()).toHaveLength(1);
    expect(await taskService.list({ agentId })).toHaveLength(1);
  });
});
