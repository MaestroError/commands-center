import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/agents.js";
import { bootstrapRuntimePaths } from "../../src/lib/runtime-paths.js";
import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";
import { createEmbeddedChatService } from "../../src/opencode/embedded-chat-service.js";
import { buildEmbeddedTaskPermissions } from "../../src/opencode/embedded-task-permissions.js";
import {
  createConversationService,
  type ConversationService,
} from "../../src/services/conversation-service.js";
import {
  createTaskExecutionService,
  type TaskExecutionService,
} from "../../src/services/task-execution-service.js";
import { createTaskService, type TaskService } from "../../src/services/task-service.js";
import { resolveSpecialistWorkspacePath } from "../../src/services/specialist-workspace.js";
import { createTestDatabase } from "../helpers/db.js";
import { createLocalModelProvider } from "../e2e/model-provider.js";

describe("embedded task recovery", () => {
  const savedEnv = { ...process.env };
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let provider: Awaited<ReturnType<typeof createLocalModelProvider>>;
  let host: EmbeddedOpenCodeHost;
  let conversationService: ConversationService;
  let execution: TaskExecutionService;
  let tasks: TaskService;
  let directory: string;

  async function open(): Promise<void> {
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: database.config.paths.workspaceDir,
      sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
    });
    conversationService = createConversationService({
      db: database.client.db,
      config: database.config,
      opencodeService: createEmbeddedChatService(host),
    });
    execution = createTaskExecutionService({
      db: database.client.db,
      taskService: tasks,
      conversationService,
      buildSessionPermissions: buildEmbeddedTaskPermissions,
      monitor: { autoStart: false, initialPollMs: 20, maxPollMs: 50, idlePolls: 1 },
    });
  }
  async function reopen(): Promise<void> {
    execution.dispose();
    conversationService.dispose();
    await host.close();
    await open();
  }
  beforeAll(async () => {
    database = await createTestDatabase();
    await bootstrapRuntimePaths(database.config);
    directory = resolveSpecialistWorkspacePath({
      config: database.config,
      slug: "tasks",
      status: "active",
    });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "AGENTS.md"), "Execute the task.");
    process.env["OPENCODE_TEST_HOME"] = database.cwd;
    provider = await createLocalModelProvider();
    const configuration = join(
      database.config.paths.workspaceDir,
      ".cc/opencode-v2/config/opencode",
    );
    await mkdir(configuration, { recursive: true });
    await writeFile(
      join(configuration, "opencode.json"),
      JSON.stringify({
        model: "local-e2e/test",
        providers: {
          "local-e2e": {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: provider.origin, apiKey: "local" },
            models: { test: {} },
          },
        },
      }),
    );
    await database.client.db.insert(agents).values({
      id: "tasks",
      slug: "tasks",
      name: "Tasks",
      role: "Testing",
      instructions: "Execute tasks.",
      default_model: "local-e2e/test",
      status: "active",
      capabilities_json: "{}",
      created_at: new Date(),
      updated_at: new Date(),
    });
    tasks = createTaskService({ db: database.client.db, config: database.config });
    await open();
  }, 30000);
  afterAll(async () => {
    execution?.dispose();
    conversationService?.dispose();
    await host?.close();
    await provider?.close();
    await database?.cleanup();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  it("delivers task system instructions with the run identity to the provider", async () => {
    const task = await tasks.create({ agentId: "tasks", title: "Audit task instructions" });
    const run = await tasks.createRun({
      taskId: task.id,
      agentId: "tasks",
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Audit task instructions",
    });
    const conversation = await conversationService.createTaskRunConversation({
      agentId: "tasks",
      taskId: task.id,
      taskRunId: run.id,
      title: task.title,
    });
    await conversationService.sendTaskRunPrompt(conversation.id, {
      text: "Audit task instructions",
      attachments: [],
    });
    await tasks.updateRun(run.id, { status: "completed" });
    const payload = JSON.parse(provider.requests.at(-1)!) as {
      messages: { role: string; content: unknown }[];
    };
    const system = JSON.stringify(payload.messages.filter((message) => message.role === "system"));
    expect(system).toContain(run.id);
    expect(system).toContain("cc_default_set_task_result");
    expect(system).not.toContain("interactive CC (CommandsCenter) chat session");
  });

  it("finalizes a persisted completed turn after reopening the host without resending it", async () => {
    const task = await tasks.create({
      agentId: "tasks",
      title: "Recover completed",
      description: "REOPEN_COMPLETED",
    });
    const run = await execution.queue(task.id);
    await expect
      .poll(async () => (await tasks.getRunById(run.id))?.opencodeSessionId, { timeout: 10000 })
      .toBeTruthy();
    const sessionID = (await tasks.getRunById(run.id))!.opencodeSessionId!;
    await expect
      .poll(() => provider.requests.some((body) => body.includes("REOPEN_COMPLETED")), {
        timeout: 10000,
      })
      .toBe(true);
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(10000) });
    await reopen();
    await execution.resumeRunningTaskRuns();
    await expect
      .poll(async () => (await tasks.getRunById(run.id))?.status, { timeout: 10000 })
      .toBe("completed");
    expect(provider.requests.filter((body) => body.includes("REOPEN_COMPLETED"))).toHaveLength(1);
  }, 15000);

  it("starts a queued run recovered after reopening the host", async () => {
    const task = await tasks.create({ agentId: "tasks", title: "Recover queued" });
    const run = await tasks.createRun({
      taskId: task.id,
      agentId: "tasks",
      status: "queued",
      triggerSource: "manual",
      renderedPrompt: "RECOVER_QUEUED",
    });
    await reopen();
    await execution.resumeRunningTaskRuns();
    await expect
      .poll(async () => (await tasks.getRunById(run.id))?.opencodeSessionId, { timeout: 10000 })
      .toBeTruthy();
    const sessionID = (await tasks.getRunById(run.id))!.opencodeSessionId!;
    await expect
      .poll(() => provider.requests.some((body) => body.includes("RECOVER_QUEUED")), {
        timeout: 10000,
      })
      .toBe(true);
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(10000) });
    execution.startTaskRunMonitor(run.id);
    await expect
      .poll(async () => (await tasks.getRunById(run.id))?.status, { timeout: 10000 })
      .toBe("completed");
  }, 15000);

  it("cancels an interrupted run during recovery after reopening the host", async () => {
    provider.hold();
    const task = await tasks.create({
      agentId: "tasks",
      title: "Recover interrupted",
      description: "INTERRUPTED_REOPEN",
    });
    const run = await execution.queue(task.id);
    await expect
      .poll(() => provider.requests.some((body) => body.includes("INTERRUPTED_REOPEN")), {
        timeout: 10000,
      })
      .toBe(true);
    const sessionID = (await tasks.getRunById(run.id))!.opencodeSessionId!;
    await createEmbeddedChatService(host).abortSession(directory, sessionID);
    await host.sessions.wait({ sessionID });
    provider.release();
    await reopen();
    await execution.resumeRunningTaskRuns();
    expect((await tasks.getRunById(run.id))?.errorDetails?.["errorName"]).toBe(
      "TaskRunEngineInterrupted",
    );
  }, 15000);
});
