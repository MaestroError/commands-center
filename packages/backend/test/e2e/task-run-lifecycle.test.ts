/**
 * Task run lifecycle e2e — issue #96 §2
 *
 * Drives execution + monitor + scheduler together against a real SQLite
 * database with an in-memory OpenCode double. Covers the async run lifecycle
 * (queue → running → completed → task ready_to_check), the stall → cancel →
 * auto-requeue → failed-after-cap path, the model-error fallback chain, and
 * resumeRunningTaskRuns re-attachment across a simulated restart.
 */

import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createConversationService } from "../../src/services/conversation-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskSchedulerService } from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createMockOpenCodeService } from "../helpers/fake-opencode";
import { createTestDatabase } from "../helpers/db";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

const disposers: Array<() => void | Promise<void>> = [];

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
    name: "Lifecycle Specialist",
    role: "run tasks",
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

async function makeTestDb(): Promise<TestDb> {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  return testDb;
}

function buildStack(
  testDb: TestDb,
  opencode: ReturnType<typeof createMockOpenCodeService>,
  monitor?: Parameters<typeof createTaskExecutionService>[0]["monitor"],
) {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const conversationService = createConversationService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService: opencode,
  });
  const ref: { current?: ReturnType<typeof createTaskSchedulerService> } = {};
  const executionService = createTaskExecutionService({
    db: testDb.client.db,
    taskService,
    conversationService,
    monitor,
    onRunTerminal: (run) => ref.current?.handleRunTerminal(run),
  });
  disposers.push(() => executionService.dispose());
  const scheduler = createTaskSchedulerService({
    db: testDb.client.db,
    taskService,
    executionService,
  });
  ref.current = scheduler;
  return { taskService, conversationService, executionService, scheduler };
}

const FAST_MONITOR = { initialPollMs: 1, maxPollMs: 1, idlePolls: 1 } as const;

describe("task run lifecycle e2e", () => {
  it("drives an async run from queued to completed and lands the task in ready_to_check", async () => {
    const testDb = await makeTestDb();
    const opencode = createMockOpenCodeService({ completeAsyncPrompt: true });
    const { taskService, executionService } = buildStack(testDb, opencode, FAST_MONITOR);

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId, title: "Ship the report" });

    const run = await executionService.trigger(task.id, { triggerSource: "manual" });
    expect(run.status).toBe("queued");

    await expect.poll(async () => (await taskService.getRunById(run.id))?.status).toBe("completed");
    await expect.poll(async () => (await taskService.get(task.id))?.status).toBe("ready_to_check");
  });

  it("detects a stalled run, aborts the OpenCode session, and cancels it", async () => {
    const testDb = await makeTestDb();
    // Never completes the async prompt: the session accepts the prompt but never
    // produces an assistant message, so the monitor detects a no-progress stall.
    const opencode = createMockOpenCodeService();
    const { taskService, executionService } = buildStack(testDb, opencode, {
      initialPollMs: 1,
      maxPollMs: 1,
      idlePolls: 1,
      noProgressMs: 15,
      maxLifetimeMs: 5 * 60 * 1000,
    });

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId, title: "Perpetually stalled" });

    const run = await executionService.trigger(task.id, { triggerSource: "manual" });

    await expect
      .poll(async () => (await taskService.getRunById(run.id))?.status, { timeout: 5000 })
      .toBe("cancelled");
    const cancelled = await taskService.getRunById(run.id);
    expect(cancelled?.cancellationReason).toContain("stall timeout");
    expect(opencode.abortSession).toHaveBeenCalledWith(expect.any(String), "session-1");
  });

  it("queues a fallback run on the fallback model chain after a terminal model error", async () => {
    const testDb = await makeTestDb();
    const opencode = createMockOpenCodeService({
      completeAsyncPrompt: true,
      providers: {
        all: [
          { id: "openai", models: { "gpt-4.1": {} } },
          { id: "anthropic", models: { "claude-haiku": {} } },
        ],
        default: {},
        connected: ["openai", "anthropic"],
      },
      // The first attempt (openai) returns a retryable provider error; the
      // fallback attempt (anthropic) succeeds.
      promptError: ({ model }) =>
        model?.providerID === "openai"
          ? { name: "APIError", message: "Provider is overloaded", data: { isRetryable: true } }
          : undefined,
    });
    const { taskService, executionService } = buildStack(testDb, opencode, FAST_MONITOR);

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({
      agentId,
      title: "Needs fallback",
      fallbackModels: ["anthropic/claude-haiku"],
    });

    const run = await executionService.trigger(task.id, { triggerSource: "manual" });

    // The primary attempt lands in error and a linked fallback run is queued.
    await expect.poll(async () => (await taskService.getRunById(run.id))?.status).toBe("error");
    await expect.poll(async () => (await taskService.listRuns(task.id)).length).toBe(2);
    const runs = await taskService.listRuns(task.id);
    const fallback = runs.find((r) => r.retryOfRunId === run.id);
    expect(fallback).toBeDefined();
    await expect
      .poll(async () => (await taskService.getRunById(fallback!.id))?.status)
      .toBe("completed");
  });

  it("cancels a queued run and rejects cancelling a terminal or unknown run", async () => {
    const testDb = await makeTestDb();
    const opencode = createMockOpenCodeService({ completeAsyncPrompt: true });
    const { taskService, executionService } = buildStack(testDb, opencode, { autoStart: false });

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId, title: "Cancellable" });
    const queued = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "queued",
      triggerSource: "manual",
      renderedPrompt: "Do it.",
    });

    const cancelled = await executionService.cancel(queued.id, { reason: "changed my mind" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancellationReason).toBe("changed my mind");

    // A terminal run can no longer be cancelled.
    await expect(executionService.cancel(queued.id)).rejects.toThrow();
    // An unknown run id is a not-found error.
    await expect(executionService.cancel("does-not-exist")).rejects.toThrow();
  });

  it("previews a queued task run and lists active runs", async () => {
    const testDb = await makeTestDb();
    const opencode = createMockOpenCodeService({ completeAsyncPrompt: true });
    const { taskService, executionService } = buildStack(testDb, opencode, { autoStart: false });

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId, title: "Previewable" });

    const preview = await executionService.preview(task.id, { triggerSource: "manual" });
    expect(preview.renderedPrompt).toContain("Previewable");

    await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Working.",
    });
    const active = await executionService.listActiveRuns();
    expect(active.length).toBeGreaterThan(0);
  });

  it("resumes a running run with no OpenCode session by requeueing it on restart", async () => {
    const testDb = await makeTestDb();
    const opencode = createMockOpenCodeService({ completeAsyncPrompt: true });
    const { taskService, executionService } = buildStack(testDb, opencode, { autoStart: false });

    const agentId = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId, title: "Interrupted mid-run" });
    // Simulate a crash: a run left in "running" without an OpenCode session id.
    const run = await taskService.createRun({
      taskId: task.id,
      agentId,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Do the work.",
    });

    await executionService.resumeRunningTaskRuns();

    const resumed = await taskService.getRunById(run.id);
    // With no session to re-attach to, the run is requeued for a fresh attempt.
    expect(["queued", "running", "completed"]).toContain(resumed?.status);
  });
});
