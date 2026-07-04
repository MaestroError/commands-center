import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
import {
  createTaskContextToolDefinitions,
  createTaskLiveToolDefinitions,
  createTasksManagementToolDefinitions,
} from "../../../src/mcp/cc-managed/groups/cc-tasks-management/tools/task-management-tools";
import { createTaskExecutionService } from "../../../src/services/task-execution-service";
import { createTaskService } from "../../../src/services/task-service";
import { createTestDatabase } from "../../helpers/db";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

type ToolResultShape = {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ type: "text"; text: string }>;
};
type ToolLike = {
  name: string;
  execute: (args: unknown, context?: { agentSlug: string }) => Promise<ToolResultShape>;
};
const asTool = (tool: unknown): ToolLike => tool as ToolLike;

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
    name: "Tools Specialist",
    role: "manage tasks",
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
  const taskExecutionService = createTaskExecutionService({
    db: testDb.client.db,
    taskService,
  });
  disposers.push(() => taskExecutionService.dispose());
  const tools = createTasksManagementToolDefinitions({
    db: testDb.client.db,
    config: testDb.config,
    taskService,
    taskExecutionService,
  });
  const byName = (name: string) => asTool(tools.find((t) => t.name === name));
  return { testDb, taskService, taskExecutionService, tools, byName };
}

const ctx = { agentSlug: "tools-specialist" };

describe("tasks management tools", () => {
  it("creates, gets, updates, lists, queues, and schedules a task", async () => {
    const { testDb, byName } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);

    const created = await byName("create_task").execute({ title: "Do the thing" }, ctx);
    expect(created.isError).toBeFalsy();
    const taskId = (created.structuredContent as { id: string }).id;

    const got = await byName("get_task").execute({ taskId }, ctx);
    expect((got.structuredContent as { title: string }).title).toBe("Do the thing");

    const updated = await byName("update_task").execute({
      taskId,
      input: { title: "Do the better thing" },
    });
    expect((updated.structuredContent as { title: string }).title).toBe("Do the better thing");

    const listed = await byName("list_tasks").execute({});
    expect((listed.structuredContent as { tasks: unknown[] }).tasks).toHaveLength(1);

    const scheduled = await byName("schedule_task").execute({
      taskId,
      scheduledAt: "2027-01-01T00:00:00.000Z",
    });
    expect((scheduled.structuredContent as { status: string }).status).toBe("scheduled");

    const queued = await byName("queue_task").execute({ taskId });
    expect(queued.isError).toBeFalsy();

    const runs = await byName("list_task_runs").execute({ taskId });
    expect((runs.structuredContent as { runs: unknown[] }).runs.length).toBeGreaterThan(0);
    const runId = (runs.structuredContent as { runs: Array<{ id: string }> }).runs[0]!.id;
    const run = await byName("get_task_run").execute({ taskId, runId });
    expect(run.isError).toBeFalsy();
  });

  it("returns tool errors for missing tasks and runs", async () => {
    const { byName } = await setup();

    expect((await byName("get_task").execute({ taskId: "nope" }, ctx)).isError).toBe(true);
    expect(
      (await byName("update_task").execute({ taskId: "nope", input: { title: "x" } })).isError,
    ).toBe(true);
    expect(
      (
        await byName("schedule_task").execute({
          taskId: "nope",
          scheduledAt: "2027-01-01T00:00:00.000Z",
        })
      ).isError,
    ).toBe(true);
    expect((await byName("get_task_run").execute({ taskId: "nope", runId: "x" })).isError).toBe(
      true,
    );
  });

  it("manages task templates end to end", async () => {
    const { testDb, byName } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);

    const created = await byName("create_task_template").execute(
      { title: "Nightly", description: "Run nightly." },
      ctx,
    );
    const templateId = (created.structuredContent as { id: string }).id;

    expect((await byName("list_task_templates").execute({})).structuredContent).toMatchObject({
      templates: expect.any(Array),
    });

    const got = await byName("get_task_template").execute({ templateId });
    expect((got.structuredContent as { title: string }).title).toBe("Nightly");

    const updated = await byName("update_task_template").execute({
      templateId,
      input: { title: "Nightly v2" },
    });
    expect((updated.structuredContent as { title: string }).title).toBe("Nightly v2");

    const disabled = await byName("disable_task_template").execute({ templateId });
    expect((disabled.structuredContent as { enabled: boolean }).enabled).toBe(false);
    const enabled = await byName("enable_task_template").execute({ templateId });
    expect((enabled.structuredContent as { enabled: boolean }).enabled).toBe(true);

    const fromTemplate = await byName("create_task_from_template").execute({ templateId }, ctx);
    expect(fromTemplate.isError).toBeFalsy();

    const runNow = await byName("run_task_template_now").execute({ taskId: templateId }, ctx);
    expect(runNow.isError).toBeFalsy();
  });

  it("errors when a template id is missing or the template does not exist", async () => {
    const { testDb, byName } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);

    expect((await byName("get_task_template").execute({}, ctx)).isError).toBe(true);
    expect((await byName("get_task_template").execute({ templateId: "nope" }, ctx)).isError).toBe(
      true,
    );
    expect(
      (await byName("enable_task_template").execute({ templateId: "nope" }, ctx)).isError,
    ).toBe(true);
    expect(
      (await byName("disable_task_template").execute({ templateId: "nope" }, ctx)).isError,
    ).toBe(true);
    expect(
      (await byName("create_task_from_template").execute({ templateId: "nope" }, ctx)).isError,
    ).toBe(true);
  });

  it("errors when the calling specialist slug is unknown", async () => {
    const { byName } = await setup();
    const result = await byName("create_task").execute({ title: "Orphan" }, { agentSlug: "ghost" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ghost");
  });

  it("reads and appends task context", async () => {
    const { testDb, taskService } = await setup();
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const task = await taskService.create({ agentId, title: "Context task" });

    const contextTools = createTaskContextToolDefinitions({ taskService });
    const read = asTool(contextTools.find((t) => t.name === "read_task_context"));
    const append = asTool(contextTools.find((t) => t.name === "append_task_context"));

    const appended = await append.execute({ taskId: task.id, text: "extra context" });
    expect(appended.isError).toBeFalsy();
    const readBack = await read.execute({ taskId: task.id });
    expect(JSON.stringify(readBack.structuredContent)).toContain("extra context");

    expect((await read.execute({ taskId: "nope" })).isError).toBe(true);
    expect((await append.execute({ taskId: "nope", text: "x" })).isError).toBe(true);
  });
});

describe("task live tools", () => {
  function makeLiveTools(testDb: TestDb, reviewedValues: Record<string, string>) {
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
    });
    disposers.push(() => taskExecutionService.dispose());
    const conversationService = {
      resolveCurrent: vi.fn(() => Promise.resolve({ current: { id: "conv-1" } })),
    };
    const liveRequestService = {
      create: vi.fn((_request: unknown) =>
        Promise.resolve({ action: "submit", values: reviewedValues }),
      ),
    };
    const tools = createTaskLiveToolDefinitions({
      db: testDb.client.db,
      config: testDb.config,
      taskService,
      taskExecutionService,
      conversationService: conversationService as never,
      liveRequestService: liveRequestService as never,
    });
    return { taskService, tools, liveRequestService };
  }

  it("drafts a new task through an operator review", async () => {
    const { testDb } = await setup();
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const { tools, liveRequestService } = makeLiveTools(testDb, {
      title: "Reviewed title",
      description: "Reviewed description",
      agentId,
      contextText: "reviewed context",
    });

    const draft = asTool(tools.find((t) => t.name === "draft_task"));
    const result = await draft.execute({ title: "Proposed" }, ctx);

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { title: string }).title).toBe("Reviewed title");
    expect(liveRequestService.create).toHaveBeenCalledOnce();
  });

  it("drafts an update to an existing task through review", async () => {
    const { testDb } = await setup();
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const { taskService, tools } = makeLiveTools(testDb, { title: "Edited title" });
    const task = await taskService.create({ agentId, title: "Original" });

    const draftUpdate = asTool(tools.find((t) => t.name === "draft_task_update"));
    const result = await draftUpdate.execute(
      { taskId: task.id, input: { title: "Suggested" } },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { title: string }).title).toBe("Edited title");
  });

  it("surfaces the full editable set when no fields are proposed", async () => {
    const { testDb } = await setup();
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const { taskService, tools, liveRequestService } = makeLiveTools(testDb, {
      title: "Everything",
      description: "New desc",
      agentId,
      scheduledAt: "2027-01-01T00:00:00.000Z",
      dueAt: "2027-01-02T00:00:00.000Z",
      contextText: "new context",
    });
    const task = await taskService.create({ agentId, title: "Original", description: "old" });

    const draftUpdate = asTool(tools.find((t) => t.name === "draft_task_update"));
    // No `input` → showAll path surfaces every editable field for review.
    const result = await draftUpdate.execute({ taskId: task.id }, ctx);
    expect(result.isError).toBeFalsy();
    const fields = (
      liveRequestService.create.mock.calls[0]![0] as { fields: Array<{ name: string }> }
    ).fields;
    expect(fields.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        "title",
        "description",
        "agentId",
        "scheduledAt",
        "dueAt",
        "contextText",
      ]),
    );
    expect((result.structuredContent as { title: string }).title).toBe("Everything");
  });

  it("surfaces only the proposed fields when a focused update is requested", async () => {
    const { testDb } = await setup();
    const agentId = await insertAgent(testDb.client.db, ctx.agentSlug);
    const { taskService, tools, liveRequestService } = makeLiveTools(testDb, {
      description: "Focused desc",
    });
    const task = await taskService.create({ agentId, title: "Original" });

    const draftUpdate = asTool(tools.find((t) => t.name === "draft_task_update"));
    const result = await draftUpdate.execute(
      { taskId: task.id, input: { description: "Proposed desc" } },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const fields = (
      liveRequestService.create.mock.calls[0]![0] as { fields: Array<{ name: string }> }
    ).fields;
    expect(fields.map((f) => f.name)).toEqual(["description"]);
  });

  it("errors when drafting an update for a missing task", async () => {
    const { testDb } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const { tools } = makeLiveTools(testDb, {});
    const draftUpdate = asTool(tools.find((t) => t.name === "draft_task_update"));
    expect((await draftUpdate.execute({ taskId: "nope" }, ctx)).isError).toBe(true);
  });

  it("errors when live-request infrastructure is unavailable", async () => {
    const { testDb, taskService, taskExecutionService } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const tools = createTaskLiveToolDefinitions({
      db: testDb.client.db,
      config: testDb.config,
      taskService,
      taskExecutionService,
    });
    const draft = asTool(tools.find((t) => t.name === "draft_task"));
    const result = await draft.execute({ title: "Proposed" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("chat live requests");
  });
});
