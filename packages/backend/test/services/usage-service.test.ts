import { describe, expect, it } from "vitest";

import { isUsageUnknown } from "@cc/shared/schemas";

import { agents, conversations, messages, task_runs, tasks } from "../../src/db/schema/index";
import { createUsageService } from "../../src/services/usage-service";
import { createTestDatabase } from "../helpers/db";

type Metrics = {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
};

async function fixture() {
  const testDb = await createTestDatabase();
  const db = testDb.client.db;
  let messageSeq = 0;

  await db.insert(agents).values({
    id: "agent-1",
    slug: "agent-1",
    name: "Agent",
    role: "help",
    instructions: "help",
    default_model: "openai/gpt-4.1",
    status: "active",
    capabilities_json: "{}",
    created_at: new Date(),
    updated_at: new Date(),
  });

  async function addTask(id: string) {
    await db.insert(tasks).values({
      id,
      agent_id: "agent-1",
      title: id,
      description: "",
      context: "",
      todos_json: "[]",
      status: "queued",
      enabled: true,
      archived: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  async function addRun(id: string, taskId: string) {
    await db.insert(task_runs).values({
      id,
      task_id: taskId,
      agent_id: "agent-1",
      status: "completed",
      trigger_source: "manual",
      rendered_prompt: "",
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  await db.insert(conversations).values({
    id: "conv-chat",
    agent_id: "agent-1",
    opencode_session_id: "ses-chat",
    status: "active",
    source: "chat",
    is_current: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  async function addConversation(id: string, taskId: string, taskRunId: string) {
    await addTask(taskId).catch(() => undefined);
    await addRun(taskRunId, taskId);
    await db.insert(conversations).values({
      id,
      agent_id: "agent-1",
      opencode_session_id: `ses-${id}`,
      status: "active",
      source: "task_run",
      is_current: false,
      task_id: taskId,
      task_run_id: taskRunId,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  async function addMessage(conversationId: string, role: string, metrics?: Metrics) {
    messageSeq += 1;
    await db.insert(messages).values({
      id: `m-${String(messageSeq)}`,
      conversation_id: conversationId,
      role,
      content: "x",
      created_at: new Date(),
      updated_at: new Date(),
      tokens_input: metrics?.input ?? null,
      tokens_output: metrics?.output ?? null,
      tokens_reasoning: metrics?.reasoning ?? null,
      tokens_cache_read: metrics?.cacheRead ?? null,
      tokens_cache_write: metrics?.cacheWrite ?? null,
      cost: metrics?.cost ?? null,
    });
  }

  return { testDb, service: createUsageService({ db }), addConversation, addMessage };
}

describe("getConversationUsage", () => {
  it("sums the components across a conversation's messages", async () => {
    const { testDb, service, addMessage } = await fixture();

    try {
      await addMessage("conv-chat", "user");
      await addMessage("conv-chat", "assistant", {
        input: 100,
        output: 20,
        reasoning: 5,
        cacheRead: 7,
        cacheWrite: 3,
        cost: 0.001,
      });
      await addMessage("conv-chat", "assistant", { input: 50, output: 10, cost: 0.002 });

      const usage = await service.getConversationUsage("conv-chat");

      expect(usage.tokens).toEqual({
        input: 150,
        output: 30,
        reasoning: 5,
        cacheRead: 7,
        cacheWrite: 3,
      });
      expect(usage.totalTokens).toBe(195);
      expect(usage.cost).toBeCloseTo(0.003, 6);
      // The user message counts toward scope but not toward coverage.
      expect(usage.messageCount).toBe(3);
      expect(usage.assistantMessageCount).toBe(2);
      expect(usage.countedMessageCount).toBe(2);
      expect(isUsageUnknown(usage)).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("reports unknown rather than zero when nothing carried metrics", async () => {
    const { testDb, service, addMessage } = await fixture();

    try {
      await addMessage("conv-chat", "user");
      await addMessage("conv-chat", "assistant");

      const usage = await service.getConversationUsage("conv-chat");

      // A confident "0 tokens" would be a lie about messages we simply have no
      // metrics for; tokens stays absent so the UI can say so.
      expect(usage.tokens).toBeUndefined();
      expect(usage.messageCount).toBe(2);
      expect(usage.countedMessageCount).toBe(0);
      expect(isUsageUnknown(usage)).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("omits cost when no provider in scope billed per request", async () => {
    const { testDb, service, addMessage } = await fixture();

    try {
      await addMessage("conv-chat", "assistant", { input: 10, output: 2, cost: 0 });

      const usage = await service.getConversationUsage("conv-chat");

      expect(usage.cost).toBeUndefined();
      expect(usage.totalTokens).toBe(12);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns an empty total for a conversation with no messages", async () => {
    const { testDb, service } = await fixture();

    try {
      const usage = await service.getConversationUsage("conv-chat");

      expect(usage.messageCount).toBe(0);
      expect(isUsageUnknown(usage)).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("getTaskUsage", () => {
  it("totals every run of the task and breaks it down per run", async () => {
    const { testDb, service, addConversation, addMessage } = await fixture();

    try {
      await addConversation("conv-run-1", "task-1", "run-1");
      await addConversation("conv-run-2", "task-1", "run-2");
      // A different task must not leak into the total.
      await addConversation("conv-other", "task-2", "run-other");

      await addMessage("conv-run-1", "assistant", { input: 100, output: 10, cost: 0.001 });
      // A reply continues run-1's own conversation, so it grows that run's
      // total rather than appearing as a separate run.
      await addMessage("conv-run-1", "user");
      await addMessage("conv-run-1", "assistant", { input: 40, output: 5, cost: 0.002 });
      // run-2 is a retry of run-1; its tokens were really spent, so they count.
      await addMessage("conv-run-2", "assistant", { input: 200, output: 20, cost: 0.004 });
      await addMessage("conv-other", "assistant", { input: 999, output: 999, cost: 9 });

      const usage = await service.getTaskUsage("task-1");

      expect(usage.runCount).toBe(2);
      expect(usage.total.totalTokens).toBe(375);
      expect(usage.total.cost).toBeCloseTo(0.007, 6);
      expect(usage.total.messageCount).toBe(4);
      expect(usage.total.assistantMessageCount).toBe(3);
      expect(usage.total.countedMessageCount).toBe(3);

      expect(usage.runs["run-1"]?.totalTokens).toBe(155);
      expect(usage.runs["run-2"]?.totalTokens).toBe(220);
      expect(usage.runs["run-other"]).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("counts a run whose conversation has no messages yet", async () => {
    const { testDb, service, addConversation, addMessage } = await fixture();

    try {
      await addConversation("conv-run-1", "task-1", "run-1");
      // A run whose session exists but has produced nothing yet — it must still
      // be a run, or the UI reports "across 1 run" for a task that has two.
      await addConversation("conv-run-2", "task-1", "run-2");
      await addMessage("conv-run-1", "assistant", { input: 10, output: 1 });

      const usage = await service.getTaskUsage("task-1");

      expect(usage.runCount).toBe(2);
      expect(usage.runs["run-2"]).toBeDefined();
      expect(usage.runs["run-2"]?.messageCount).toBe(0);
      expect(isUsageUnknown(usage.runs["run-2"]!)).toBe(true);
      expect(usage.total.messageCount).toBe(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("keeps a run whose messages carry no metrics visible but unknown", async () => {
    const { testDb, service, addConversation, addMessage } = await fixture();

    try {
      await addConversation("conv-run-1", "task-1", "run-1");
      await addConversation("conv-run-2", "task-1", "run-2");
      await addMessage("conv-run-1", "assistant", { input: 10, output: 1 });
      await addMessage("conv-run-2", "assistant");

      const usage = await service.getTaskUsage("task-1");

      expect(usage.runCount).toBe(2);
      expect(isUsageUnknown(usage.runs["run-2"]!)).toBe(true);
      // The task total is still known, from the run that did report.
      expect(usage.total.totalTokens).toBe(11);
      expect(usage.total.countedMessageCount).toBe(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns an empty total for a task with no runs", async () => {
    const { testDb, service } = await fixture();

    try {
      const usage = await service.getTaskUsage("task-nothing");

      expect(usage.runCount).toBe(0);
      expect(usage.runs).toEqual({});
      expect(isUsageUnknown(usage.total)).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });
});
