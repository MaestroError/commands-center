import { describe, expect, it } from "vitest";

import { agents } from "../../../src/db/schema/index";
import type { AppDb } from "../../../src/db/client";
import { createPublicMcpRunService } from "../../../src/mcp/public/run-service";
import { createTaskService } from "../../../src/services/task-service";
import { createTestDatabase } from "../../helpers/db";

async function insertAgent(db: AppDb): Promise<string> {
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-run-service",
      slug: "run-service-agent",
      name: "Run Service Agent",
      role: "run tasks",
      instructions: "Run tasks.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify({ appMcpServers: [], appToolPermissions: [] }),
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert agent.");
  }

  return agent.id;
}

describe("createPublicMcpRunService", () => {
  it("projects a terminal run result without leaking internal fields", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const runService = createPublicMcpRunService({ taskService });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId,
        title: "Result task",
        description: "Produce a result.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "completed",
        triggerSource: "api",
        renderedPrompt: "Do it.",
        resultText: "All done.",
        finalMessage: "Finished.",
      });

      const result = await runService.getResult(run.id);

      expect(result).toMatchObject({
        taskId: task.id,
        runId: run.id,
        status: "completed",
        resultText: "All done.",
        finalMessage: "Finished.",
        timedOut: false,
        artifacts: [],
      });
      // No leaked engine internals.
      expect(Object.keys(result ?? {})).not.toContain("renderedPrompt");
      expect(Object.keys(result ?? {})).not.toContain("opencodeSessionId");
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns undefined for an unknown run", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const runService = createPublicMcpRunService({ taskService });

    try {
      expect(await runService.getResult("missing")).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("waits until the run reaches a terminal state", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const runService = createPublicMcpRunService({ taskService });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId,
        title: "Waiting task",
        description: "Complete soon.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "running",
        triggerSource: "api",
        renderedPrompt: "Do it.",
      });

      // Flip the run to completed on the first poll tick.
      let ticks = 0;
      const sleep = async () => {
        ticks += 1;
        if (ticks === 1) {
          await taskService.updateRun(run.id, { status: "completed", resultText: "Done." });
        }
      };

      const result = await runService.waitForResult(run.id, { capMs: 10_000, pollMs: 1, sleep });

      expect(result).toMatchObject({ status: "completed", resultText: "Done.", timedOut: false });
    } finally {
      await testDb.cleanup();
    }
  });

  it("uses the injected resolveCapMs when no explicit cap is given", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    // cap 0 => return immediately without waiting.
    const runService = createPublicMcpRunService({
      taskService,
      resolveCapMs: () => Promise.resolve(0),
    });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId,
        title: "Cap task",
        description: "",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "running",
        triggerSource: "api",
        renderedPrompt: "Do it.",
      });

      let slept = false;
      const result = await runService.waitForResult(run.id, {
        pollMs: 1,
        sleep: () => {
          slept = true;
          return Promise.resolve();
        },
      });

      expect(result).toMatchObject({ status: "running", timedOut: true });
      expect(slept).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns timedOut when the run stays non-terminal past the cap", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const runService = createPublicMcpRunService({ taskService });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const task = await taskService.create({
        agentId,
        title: "Slow task",
        description: "Never finishes here.",
      });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "running",
        triggerSource: "api",
        renderedPrompt: "Do it.",
      });

      const result = await runService.waitForResult(run.id, {
        capMs: 0,
        pollMs: 1,
        sleep: () => Promise.resolve(),
      });

      expect(result).toMatchObject({ status: "running", timedOut: true });
    } finally {
      await testDb.cleanup();
    }
  });
});
