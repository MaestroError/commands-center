import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { BadRequestError, ConflictError, NotFoundError } from "../../src/lib/api-error";
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
    name: "Edge Specialist",
    role: "test edges",
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

describe("task-service edge cases", () => {
  it("returns undefined/false for operations on unknown ids", async () => {
    const { taskService } = await setup();
    expect(await taskService.get("missing")).toBeUndefined();
    expect(await taskService.getTemplate("missing")).toBeUndefined();
    expect(await taskService.enable("missing")).toBeUndefined();
    expect(await taskService.disable("missing")).toBeUndefined();
    expect(await taskService.enableTemplate("missing")).toBeUndefined();
    expect(await taskService.disableTemplate("missing")).toBeUndefined();
    expect(await taskService.duplicate("missing")).toBeUndefined();
    expect(await taskService.archive("missing")).toBeUndefined();
    expect(await taskService.restore("missing")).toBeUndefined();
    expect(await taskService.acceptTask("missing")).toBeUndefined();
    expect(
      await taskService.updateContext("missing", { text: "x", attachments: [] }),
    ).toBeUndefined();
    expect(await taskService.appendContext("missing", { text: "x" })).toBeUndefined();
    expect(await taskService.delete("missing")).toBe(false);
    expect(await taskService.getRunById("missing")).toBeUndefined();
    expect(await taskService.getActiveRunForTask("missing")).toBeUndefined();
  });

  it("guards queueTask against archived, disabled, conflicting, and missing-subtask states", async () => {
    const { taskService, agentId } = await setup();

    const archived = await taskService.create({ agentId, title: "Archived" });
    await taskService.archive(archived.id);
    await expect(taskService.queueTask({ taskId: archived.id })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    const draft = await taskService.create({ agentId, title: "Draft", status: "draft" });
    await expect(taskService.queueTask({ taskId: draft.id })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    const active = await taskService.create({ agentId, title: "Active" });
    await taskService.createRun({
      taskId: active.id,
      agentId,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Working.",
    });
    await expect(taskService.queueTask({ taskId: active.id })).rejects.toBeInstanceOf(
      ConflictError,
    );

    const withSubtask = await taskService.create({ agentId, title: "Has subtasks" });
    await expect(
      taskService.queueTask({ taskId: withSubtask.id, subtaskId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("manages subtasks", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "With subtasks" });

    const subtask = await taskService.createSubtask(task.id, {
      description: "Step one",
      agentId,
    });
    expect(subtask.description).toBe("Step one");

    const updated = await taskService.updateSubtask(task.id, subtask.id, {
      description: "Step 1b",
    });
    expect(updated?.description).toBe("Step 1b");

    const subtasks = await taskService.listSubtasks(task.id);
    expect(subtasks).toHaveLength(1);

    const progress = await taskService.listSubtaskProgress([task.id]);
    expect(progress[0]?.total).toBe(1);
  });

  it("manages feedback threads", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "Feedback task" });

    const feedback = await taskService.createFeedback(task.id, { body: "Please refine this." });
    expect(feedback.body).toBe("Please refine this.");

    const threads = await taskService.listFeedback(task.id);
    expect(threads).toHaveLength(1);

    const updated = await taskService.updateFeedback(task.id, feedback.id, {
      body: "Refine differently.",
    });
    expect(updated?.body).toBe("Refine differently.");
  });

  it("exposes per-agent run queries and starts a queued run", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "Queue mechanics" });

    const queued = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "queued",
      triggerSource: "manual",
      renderedPrompt: "Go.",
    });

    expect((await taskService.getNextQueuedRunForAgent(agentId))?.id).toBe(queued.id);
    expect(await taskService.getRunningRunForAgent(agentId)).toBeUndefined();

    const started = await taskService.tryStartQueuedRun(queued.id);
    expect(started?.status).toBe("running");
    expect((await taskService.getRunningRunForAgent(agentId))?.id).toBe(queued.id);
    // Starting again (already running / not queued) is a no-op.
    expect(await taskService.tryStartQueuedRun(queued.id)).toBeUndefined();
    expect(await taskService.tryStartQueuedRun("missing")).toBeUndefined();

    expect((await taskService.listActiveRuns()).length).toBeGreaterThan(0);
  });

  it("lists scheduled, recurring, and archivable tasks", async () => {
    const { taskService, agentId } = await setup();
    await taskService.create({
      agentId,
      title: "Scheduled soon",
      status: "scheduled",
      scheduledAt: "2020-01-01T00:00:00.000Z",
    });
    await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Recurring",
      recurrence: {
        mode: "recurring",
        anchorAt: "2020-01-01T09:00:00.000Z",
        timezone: "UTC",
        repeatRule: { frequency: "day", interval: 1 },
      },
    });

    expect((await taskService.listDueScheduledTasks(new Date())).length).toBeGreaterThan(0);
    expect((await taskService.listRecurringTemplates()).length).toBeGreaterThan(0);
    expect(await taskService.listDoneTasksReadyToArchive(new Date())).toEqual([]);
  });

  it("records and resolves run followups", async () => {
    const { taskService, agentId } = await setup();
    const task = await taskService.create({ agentId, title: "Followup task" });
    const run = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Working.",
    });

    const followup = await taskService.insertFollowup(run, { body: "Need input." });
    expect(await taskService.listFollowups(run.id)).toHaveLength(1);
    expect(await taskService.findInFlightFollowup(run.id)).toBeDefined();

    await taskService.markFollowupAnswered(followup.id, { answeredAt: new Date().toISOString() });
    expect(await taskService.findInFlightFollowup(run.id)).toBeUndefined();

    // A second follow-up can be marked failed instead of answered.
    const second = await taskService.insertFollowup(run, { body: "Still need input." });
    await taskService.markFollowupFailed(second.id, "delivery failed");
    expect(await taskService.findInFlightFollowup(run.id)).toBeUndefined();
  });
});
