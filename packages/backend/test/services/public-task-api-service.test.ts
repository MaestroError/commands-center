import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createPublicTaskApiService } from "../../src/services/public-task-api-service";
import { createSpecialistService } from "../../src/services/specialist-service";
import { createTaskContextAttachmentService } from "../../src/services/task-context-attachment-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskService } from "../../src/services/task-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

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
    name: "Public Specialist",
    role: "serve api",
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
  const executionService = createTaskExecutionService({ db: testDb.client.db, taskService });
  disposers.push(() => executionService.dispose());
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: testDb.config,
    taskService,
  });
  const agentService = createSpecialistService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService: { dispose: () => Promise.resolve() } as unknown as OpenCodeService,
  });
  const service = createPublicTaskApiService({
    taskService,
    executionService,
    taskContextAttachmentService,
    agentService,
  });
  const agentId = await insertAgent(testDb.client.db);
  return { testDb, taskService, service, agentId };
}

describe("public-task-api-service", () => {
  it("lists triggerable templates and toggles template status", async () => {
    const { taskService, service, agentId } = await setup();
    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Public template",
    });

    expect(await service.listTriggerableTemplates()).toHaveLength(1);

    const disabled = await service.setTemplateEnabled(template.id, false);
    expect(disabled?.enabled).toBe(false);
    // Now hidden from the triggerable listing.
    expect(await service.listTriggerableTemplates()).toHaveLength(0);
    // Direct trigger of a disabled template is treated as not found.
    expect(await service.triggerTemplate(template.id, {})).toEqual({ kind: "not_found" });

    const enabled = await service.setTemplateEnabled(template.id, true);
    expect(enabled?.enabled).toBe(true);
    expect(await service.setTemplateEnabled("missing", true)).toBeUndefined();
  });

  it("triggers a template and reads back the run status", async () => {
    const { taskService, service, agentId } = await setup();
    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Runnable",
    });

    const outcome = await service.triggerTemplate(template.id, {});
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("expected ok");
    const runId = outcome.response.runId!;
    const status = await service.getRunStatus(runId);
    expect(status?.runId).toBe(runId);
    expect(await service.getRunStatus("missing")).toBeUndefined();
  });

  it("creates, lists, and reads direct tasks; returns undefined for unknown ids", async () => {
    const { service, agentId } = await setup();

    const task = await service.createTask({ specialistId: agentId, title: "Direct task" });
    expect(task.title).toBe("Direct task");

    const scheduled = await service.scheduleTask(task.id, {
      runAt: "2027-06-01T00:00:00.000Z",
    });
    expect(scheduled?.id).toBe(task.id);
    expect(
      await service.scheduleTask("missing", { runAt: "2027-06-01T00:00:00.000Z" }),
    ).toBeUndefined();

    const triggered = await service.triggerTask(task.id, {});
    expect(triggered?.taskId).toBe(task.id);
    expect(await service.triggerTask("missing", {})).toBeUndefined();

    expect(await service.listTasks({})).toHaveLength(1);
    expect(await service.getTask(task.id)).toBeDefined();
    expect(await service.getTask("missing")).toBeUndefined();
    expect((await service.listRuns(task.id))?.length).toBeGreaterThan(0);
    expect(await service.listRuns("missing")).toBeUndefined();
    expect(await service.listFeedback("missing")).toBeUndefined();
    expect((await service.listAgents()).length).toBeGreaterThanOrEqual(0);
  });
});
