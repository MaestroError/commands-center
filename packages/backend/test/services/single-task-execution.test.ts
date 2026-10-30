import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agents } from "../../src/db/schema/index.js";
import { createTaskService } from "../../src/services/task-service.js";
import { createTaskReplyQueueService } from "../../src/services/task-reply-queue-service.js";
import { createTestDatabase } from "../helpers/db.js";

describe("single task execution", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ReturnType<typeof createTaskService>;
  let task: Awaited<ReturnType<typeof service.create>>;
  beforeEach(async () => {
    database = await createTestDatabase();
    service = createTaskService({ db: database.client.db, config: database.config });
    database.client.db
      .insert(agents)
      .values({
        id: "owner",
        slug: "owner",
        name: "Owner",
        default_model: "openai/test",
        role: "Coordinate",
        instructions: "Help",
        capabilities_json: "{}",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();
    task = await service.create({ agentId: "owner", title: "One continuous goal" });
  });
  afterEach(async () => database.cleanup());

  it("stores feedback before an execution exists", async () => {
    const reply = await service.insertFollowup(
      { taskId: task.id },
      { body: "Include evidence", requestId: "pending" },
    );
    expect(reply).toMatchObject({ status: "queued", body: "Include evidence", runId: undefined });
  });
  it("does not create an assignment for operator feedback", async () => {
    await service.insertFollowup({ taskId: task.id }, { body: "Include evidence" });
    expect(await service.listSubtasks(task.id)).toEqual([]);
  });
  it("binds pending input to the first owner execution", async () => {
    const reply = await service.insertFollowup(
      { taskId: task.id },
      { body: "Include evidence", requestId: "pending" },
    );
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    expect(await service.listFollowups(run.id)).toMatchObject([
      { id: reply.id, runId: run.id, status: "queued" },
    ]);
  });
  it("deduplicates a pending request retried after its run is created", async () => {
    const input = { body: "Include evidence", requestId: "pending" };
    const reply = await service.insertFollowup({ taskId: task.id }, input);
    await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    expect((await service.insertFollowup({ taskId: task.id }, input)).id).toBe(reply.id);
  });
  it("cancels pending input without starting a task", async () => {
    const reply = await service.insertFollowup({ taskId: task.id }, { body: "Include evidence" });
    const queue = createTaskReplyQueueService(database.client.db);
    expect(queue.cancelForTask(reply.id, task.id).status).toBe("cancelled");
  });
  it("rejects a second execution after completion", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "completed");
    await expect(service.queueTask({ taskId: task.id, triggerSource: "api" })).rejects.toThrow(
      "already has an execution",
    );
  });
  it("rejects scheduling an already-run task", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "completed");
    await expect(
      service.update(task.id, {
        status: "scheduled",
        scheduledAt: "2026-12-01T12:00:00.000Z",
      }),
    ).rejects.toThrow("already has an execution");
  });
  it("preserves completion when editing a consumed scheduled task", async () => {
    const scheduledAt = "2026-12-01T12:00:00.000Z";
    await service.update(task.id, { scheduledAt });
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "completed");
    const edited = await service.update(task.id, { title: "Updated title", scheduledAt });
    expect(edited?.status).toBe("ready_to_check");
  });
  it("rejects replacing an execution's session", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.updateRun(run.id, { opencodeSessionId: "original-session" });
    await expect(service.updateRun(run.id, { opencodeSessionId: "new-session" })).rejects.toThrow(
      "cannot switch sessions",
    );
  });
  it("serializes racing first-execution requests", async () => {
    const input = {
      taskId: task.id,
      agentId: "owner",
      status: "queued" as const,
      triggerSource: "manual" as const,
      renderedPrompt: "Goal",
    };
    const results = await Promise.allSettled([service.createRun(input), service.createRun(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("allows a duplicated task its own execution", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "completed");
    const copy = await service.duplicate(task.id);
    await service.enable(copy!.id);
    expect((await service.queueTask({ taskId: copy!.id, triggerSource: "manual" })).taskId).toBe(
      copy!.id,
    );
  });
  it("routes task feedback to its existing owner execution", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "completed");
    expect((await service.insertFollowup({ taskId: task.id }, { body: "Revise" })).runId).toBe(
      run.id,
    );
  });
  it("requires explicit continuation after stopping", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "cancelled");
    await expect(service.insertFollowup({ taskId: task.id }, { body: "Revise" })).rejects.toThrow(
      "Continue",
    );
  });
  it("retains a stop event after continuing the same run", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.setRunStatus(run.id, "cancelled", {
      cancellationReason: "Operator stopped the task",
    });
    await service.setRunStatus(run.id, "error");
    expect(await service.listTaskReplies(task.id)).toMatchObject([
      { kind: "lifecycle", body: "Operator stopped the task" },
      { kind: "lifecycle", body: expect.stringContaining("resumed") },
    ]);
  });
  it("freezes the owner's initial response while waiting for assignments", async () => {
    const run = await service.queueTask({ taskId: task.id, triggerSource: "manual" });
    await service.updateRun(run.id, {
      status: "waiting",
      finalMessage: "Delegated; awaiting output",
    });
    await service.updateRun(run.id, { status: "running", finalMessage: "Next response" });
    expect((await service.getRunById(run.id))?.initialOutcomeText).toBe(
      "Delegated; awaiting output",
    );
  });
});
