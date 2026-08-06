import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
import { createSelfTaskLiveToolDefinitions } from "../../../src/mcp/cc-managed/groups/cc-default/tools/self-task-live-tools";
import {
  blockingWaitBudgetMs,
  CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS,
} from "../../../src/mcp/cc-managed/live-request-timeouts";
import { createTaskExecutionService } from "../../../src/services/task-execution-service";
import { createTaskService } from "../../../src/services/task-service";
import { createTestDatabase } from "../../helpers/db";

const disposers: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function insertAgent(db: AppDb, slug: string): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug,
    name: "Self Specialist",
    role: "own tasks",
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

async function setup(
  reviewValues: Record<string, string>,
  createLiveRequest?: () => Promise<unknown>,
) {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const taskExecutionService = createTaskExecutionService({ db: testDb.client.db, taskService });
  disposers.push(() => taskExecutionService.dispose());
  const conversationService = {
    resolveCurrent: vi.fn(() => Promise.resolve({ current: { id: "conv-1" } })),
  };
  const liveRequestService = {
    create: vi.fn((_input: { timeoutMs?: number }) =>
      createLiveRequest
        ? createLiveRequest()
        : Promise.resolve({ action: "submit", values: reviewValues }),
    ),
  };
  const tools = createSelfTaskLiveToolDefinitions({
    db: testDb.client.db,
    config: testDb.config,
    taskService,
    taskExecutionService,
    conversationService: conversationService as never,
    liveRequestService: liveRequestService as never,
  });
  const byName = (name: string) => tools.find((t) => t.name === name)!;
  return { testDb, taskService, byName, liveRequestService };
}

const ctx = { agentSlug: "self-specialist" };

describe("self task live tools", () => {
  it("drafts a self task and assigns it to the caller after review", async () => {
    const { testDb, byName } = await setup({
      title: "Reviewed self task",
      description: "reviewed",
      contextText: "context body",
    });
    await insertAgent(testDb.client.db, ctx.agentSlug);

    const result = await byName("draft_self_task").execute({ title: "Proposed" }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { title: string }).title).toBe("Reviewed self task");
  });

  it("drafts an update to one of the caller's own tasks", async () => {
    const { testDb, taskService, byName } = await setup({ title: "Edited self task" });
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const task = await taskService.create({ agentId, title: "Original self task" });

    const result = await byName("draft_self_task_update").execute(
      { taskId: task.id, input: { title: "Suggested" } },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { title: string }).title).toBe("Edited self task");
  });

  it("errors when updating a task that does not belong to the caller", async () => {
    const { testDb, taskService, byName } = await setup({ title: "x" });
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const otherAgentId = await insertAgent(testDb.client.db, "other-specialist");
    const foreignTask = await taskService.create({ agentId: otherAgentId, title: "Not mine" });

    const result = await byName("draft_self_task_update").execute(
      { taskId: foreignTask.id, input: { title: "x" } },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Task not found");
  });

  it("drafts a self task update surfacing the full editable set when nothing is proposed", async () => {
    const { testDb, taskService, byName } = await setup({
      title: "Full edit",
      description: "d",
      scheduledAt: "",
      dueAt: "",
      contextText: "",
    });
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const task = await taskService.create({ agentId, title: "Base" });

    const result = await byName("draft_self_task_update").execute({ taskId: task.id }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { title: string }).title).toBe("Full edit");
  });

  it("drafts a self task template and updates one of the caller's own templates", async () => {
    const { testDb, taskService, byName } = await setup({
      title: "Reviewed template",
      description: "reviewed",
    });
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);

    const created = await byName("draft_self_task_template").execute(
      { title: "Proposed template", description: "d" },
      ctx,
    );
    expect(created.isError).toBeFalsy();
    expect((created.structuredContent as { title: string }).title).toBe("Reviewed template");

    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Owned template",
    });
    const updated = await byName("draft_self_task_template_update").execute(
      { templateId: template.id, input: { title: "New title" } },
      ctx,
    );
    expect(updated.isError).toBeFalsy();
  });

  it("errors when running a task that is not the caller's own", async () => {
    const { testDb, taskService, byName } = await setup({});
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const otherAgentId = await insertAgent(testDb.client.db, "other-specialist");
    const foreignTask = await taskService.create({ agentId: otherAgentId, title: "Foreign" });

    const result = await byName("run_self_task").execute({ taskId: foreignTask.id }, ctx);
    expect(result.isError).toBe(true);
  });

  it("expires the review form before the caller's tool-call timeout", async () => {
    const { testDb, byName, liveRequestService } = await setup({
      title: "Reviewed template",
      description: "reviewed",
    });
    await insertAgent(testDb.client.db, ctx.agentSlug);

    await byName("draft_self_task_template").execute({ title: "Proposed template" }, ctx);

    const request = liveRequestService.create.mock.calls[0]?.[0];

    // A form that outlives its caller applies the change with nobody left to
    // receive the result: the operator sees the template created while the agent
    // reports a timeout, and duplicates it on retry.
    expect(request?.timeoutMs).toBeLessThan(CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS);
    expect(request?.timeoutMs).toBe(
      blockingWaitBudgetMs(CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS),
    );
  });

  it("reports an expired review form without creating anything", async () => {
    const { testDb, taskService, byName } = await setup({}, () =>
      Promise.reject(new Error("Live request timed out.")),
    );
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);

    const result = await byName("draft_self_task_template").execute({ title: "Proposed" }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("did not submit the review form in time");
    expect(await taskService.listTemplates({ defaultAgentId: agentId })).toHaveLength(0);
  });

  it("omits structuredContent from error results", async () => {
    const { testDb, taskService, byName } = await setup({ title: "x" });
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const otherAgentId = await insertAgent(testDb.client.db, "other-specialist");
    const foreignTask = await taskService.create({ agentId: otherAgentId, title: "Not mine" });

    const result = await byName("draft_self_task_update").execute(
      { taskId: foreignTask.id, input: { title: "x" } },
      ctx,
    );

    // The MCP client validates structuredContent against the tool's output schema
    // even on error results, so an error-shaped payload here would come back as
    // "-32602 Structured content does not match the tool's output schema".
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toContain("Task not found");
  });

  it("errors when live-request infrastructure is unavailable", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({ db: testDb.client.db, taskService });
    disposers.push(() => taskExecutionService.dispose());
    await insertAgent(testDb.client.db, ctx.agentSlug);

    const tools = createSelfTaskLiveToolDefinitions({
      db: testDb.client.db,
      config: testDb.config,
      taskService,
      taskExecutionService,
    });
    const draft = tools.find((t) => t.name === "draft_self_task")!;
    const result = await draft.execute({ title: "Proposed" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("chat live requests");
  });
});
