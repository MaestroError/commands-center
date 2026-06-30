import { access } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { agents } from "../../src/db/schema/index";
import { createConversationService } from "../../src/services/conversation-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createTaskContextAttachmentService } from "../../src/services/task-context-attachment-service";
import { createTaskExecutionService } from "../../src/services/task-execution-service";
import { createTaskSchedulerService } from "../../src/services/task-scheduler-service";
import { createTaskService } from "../../src/services/task-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { AppDb } from "../../src/db/client";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type {
  OpenCodeService,
  OpenCodeSession,
  OpenCodeSessionMessage,
} from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("task routes", () => {
  it("supports board task lifecycle and run history endpoints", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const opencodeService = createMockOpenCodeService();
    const conversationService = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
      conversationService,
    });
    const taskSchedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService: taskExecutionService,
    });
    const server = createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService({ delegate: taskSchedulerService }),
      taskService,
      taskExecutionService,
      taskSchedulerService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const created = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          agentId: agent.id,
          title: "Ship release",
          description: "Prepare the release.",
          todos: [{ content: "Read changelog" }],
        },
      });

      expect(created.statusCode).toBe(201);
      const task = created.json<{ id: string }>();

      const listed = await server.inject({ method: "GET", url: "/api/tasks" });
      const fetched = await server.inject({ method: "GET", url: `/api/tasks/${task.id}` });
      const updated = await server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}`,
        payload: { title: "Ship stable release", status: "ready_to_check" },
      });
      const duplicated = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/duplicate`,
      });
      const disabled = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/disable`,
      });
      const enabled = await server.inject({ method: "POST", url: `/api/tasks/${task.id}/enable` });
      const archived = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/archive`,
      });
      const restored = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/restore`,
      });
      const contextUpdated = await server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/context`,
        payload: { text: "Use current changelog." },
      });
      const uploadedContext = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/context/attachments`,
        payload: {
          filename: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
          dataUrl: "data:text/plain;base64,aGVsbG8=",
        },
      });
      const rejectedContext = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/context/attachments`,
        payload: {
          filename: "run.sh",
          mimeType: "text/plain",
          sizeBytes: 5,
          dataUrl: "data:text/plain;base64,aGVsbG8=",
        },
      });
      const queued = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/queue`,
        payload: { triggerSource: "manual" },
      });
      const runs = await server.inject({ method: "GET", url: `/api/tasks/${task.id}/runs` });
      const runId = queued.json<{ id: string }>().id;
      const schedulerState = await server.inject({
        method: "GET",
        url: "/api/tasks/scheduler/state",
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);
      expect(fetched.statusCode).toBe(200);
      expect(updated.statusCode).toBe(200);
      expect(updated.json().status).toBe("ready_to_check");
      expect(duplicated.statusCode).toBe(201);
      expect(duplicated.json().id).not.toBe(task.id);
      expect(duplicated.json().title).toBe("Ship stable release copy");
      expect(duplicated.json().enabled).toBe(false);
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().status).toBe("disabled");
      expect(enabled.statusCode).toBe(200);
      expect(archived.statusCode).toBe(200);
      expect(archived.json().status).toBe("archived");
      expect(restored.statusCode).toBe(200);
      expect(restored.json().archived).toBe(false);
      expect(contextUpdated.statusCode).toBe(200);
      expect(contextUpdated.json().context).toEqual({
        text: "Use current changelog.",
        attachments: [],
      });
      expect(uploadedContext.statusCode).toBe(201);
      expect(uploadedContext.json().attachment).toMatchObject({
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
      });
      const attachmentStorageKey = String(
        uploadedContext.json<{ attachment: { storageKey: string } }>().attachment.storageKey,
      );
      const attachmentKeyParts = attachmentStorageKey.split("/");
      if (attachmentKeyParts.length !== 6) {
        throw new Error("Expected task context attachment storage key.");
      }
      expect(attachmentKeyParts[0]).toBe("specialists");
      expect(attachmentKeyParts[2]).toBe("tasks");
      expect(attachmentKeyParts[3]).toBe(task.id);
      expect(attachmentKeyParts[4]).toBe("context-attachments");
      expect(rejectedContext.statusCode).toBe(400);
      expect(runs.statusCode).toBe(200);
      expect(runs.json()).toHaveLength(1);
      expect(queued.statusCode).toBe(200);
      expect(queued.json().status).toBe("queued");
      expect(queued.json().context).toBeUndefined();
      await expect
        .poll(async () => {
          const response = await server.inject({
            method: "GET",
            url: `/api/tasks/${task.id}/runs/${String(runId)}`,
          });
          return response.json<{ status?: string }>().status;
        })
        .toBe("running");
      const session = await server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/runs/${String(runId)}/session`,
      });
      const openInChat = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/runs/${String(runId)}/open-in-chat`,
      });
      await taskService.setRunStatus(String(runId), "completed", {
        completedAt: new Date().toISOString(),
        finalMessage: "Task completed by monitor.",
      });
      const activeRuns = await server.inject({ method: "GET", url: "/api/tasks/runs/active" });
      const accepted = await server.inject({ method: "POST", url: `/api/tasks/${task.id}/accept` });
      const archiveList = await server.inject({ method: "GET", url: "/api/tasks/archive" });
      expect(session.statusCode).toBe(200);
      expect(session.json().conversation.source).toBe("task_run");
      expect(openInChat.statusCode).toBe(200);
      expect(openInChat.json().current.source).toBe("chat");
      expect(activeRuns.statusCode).toBe(200);
      expect(activeRuns.json()).toEqual([]);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().status).toBe("done");
      expect(archiveList.statusCode).toBe(200);
      expect(archiveList.json()).toEqual([]);
      expect(schedulerState.statusCode).toBe(200);
      const deleted = await server.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
      const afterDelete = await server.inject({ method: "GET", url: `/api/tasks/${task.id}` });

      expect(deleted.statusCode).toBe(204);
      expect(afterDelete.statusCode).toBe(404);
      await expect(
        access(
          join(testDb.config.paths.subdirectories.sessions, ...attachmentKeyParts.slice(0, 5)),
        ),
      ).rejects.toThrow();
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns validation failures and max limit conflicts", async () => {
    const testDb = await createTestDatabase();
    const config = { ...testDb.config, tasks: { maxTasks: 1 } };
    const taskService = createTaskService({ db: testDb.client.db, config });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
    });
    const taskSchedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService: taskExecutionService,
    });
    const server = createServer({
      config,
      logger: createLogger(config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config }),
      scheduler: createSchedulerService({ delegate: taskSchedulerService }),
      taskService,
      taskExecutionService,
      taskSchedulerService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const invalid = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "" },
      });
      const first = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "First" },
      });
      const second = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "Second" },
      });

      expect(invalid.statusCode).toBe(400);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.message).toBe("Maximum task limit reached.");
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("supports feedback, subtasks, and recurring template endpoints", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskContextAttachmentService = createTaskContextAttachmentService({
      config: testDb.config,
      taskService,
    });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
      taskContextAttachmentService,
    });
    const taskSchedulerService = createTaskSchedulerService({
      db: testDb.client.db,
      taskService,
      executionService: taskExecutionService,
    });
    const server = createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService({ delegate: taskSchedulerService }),
      taskService,
      taskExecutionService,
      taskSchedulerService,
    });

    try {
      const agent = await insertAgent(testDb.client.db);
      const mentionedAgent = await insertAgent(testDb.client.db);
      const created = await server.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { agentId: agent.id, title: "Board task" },
      });
      const task = created.json<{ id: string }>();
      const feedback = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/feedback`,
        payload: { body: "Please verify docs.", mentionedAgentIds: [mentionedAgent.id] },
      });
      const feedbackList = await server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/feedback`,
      });
      const progress = await server.inject({
        method: "GET",
        url: `/api/tasks/subtask-progress?taskIds=${task.id}`,
      });
      const preview = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/queue/preview`,
        payload: { triggerSource: "manual" },
      });
      const subtask = await server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/subtasks`,
        payload: { description: "Docs check", agentId: agent.id },
      });
      const updatedSubtask = await server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/subtasks/${String(subtask.json<{ id: string }>().id)}`,
        payload: { description: "Docs check updated" },
      });
      const subtasks = await server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/subtasks`,
      });
      const template = await server.inject({
        method: "POST",
        url: "/api/tasks/templates",
        payload: {
          defaultAgentId: agent.id,
          title: "Daily template",
          recurrence: {
            mode: "recurring",
            anchorAt: "2026-06-01T09:00:00.000Z",
            timezone: "UTC",
            repeatRule: { frequency: "day", interval: 1 },
          },
        },
      });
      const templates = await server.inject({ method: "GET", url: "/api/tasks/templates" });
      const templateDetail = await server.inject({
        method: "GET",
        url: `/api/tasks/templates/${String(template.json<{ id: string }>().id)}`,
      });
      const updatedTemplate = await server.inject({
        method: "PATCH",
        url: `/api/tasks/templates/${String(template.json<{ id: string }>().id)}`,
        payload: {
          title: "Updated daily template",
          description: "Updated prompt.",
          recurrence: null,
        },
      });
      const createdFromTemplate = await server.inject({
        method: "POST",
        url: `/api/tasks/templates/${String(template.json<{ id: string }>().id)}/tasks`,
      });
      const templateTasks = await server.inject({
        method: "GET",
        url: `/api/tasks/templates/${String(template.json<{ id: string }>().id)}/tasks`,
      });
      const runNow = await server.inject({
        method: "POST",
        url: `/api/tasks/templates/${String(template.json<{ id: string }>().id)}/run-now`,
        payload: {
          context: { text: "manual check" },
          contextAttachmentUploads: [
            {
              filename: "template-notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
              dataUrl: "data:text/plain;base64,aGVsbG8=",
            },
          ],
        },
      });

      expect(feedback.statusCode).toBe(201);
      expect(feedback.json()).toMatchObject({
        body: "Please verify docs.",
        targetAgentIds: [mentionedAgent.id],
      });
      expect(
        feedback.json<{ subtasks: Array<{ agentId: string; description: string }> }>().subtasks,
      ).toEqual([
        expect.objectContaining({ agentId: mentionedAgent.id, description: "Please verify docs." }),
      ]);
      expect(feedbackList.statusCode).toBe(200);
      expect(feedbackList.json()).toHaveLength(1);
      expect(feedbackList.json()[0].subtasks[0]).toMatchObject({
        agentId: mentionedAgent.id,
        status: "backlog",
        replies: [],
      });
      expect(progress.statusCode).toBe(200);
      expect(progress.json()).toEqual([
        {
          taskId: task.id,
          total: 1,
          completed: 0,
          active: 0,
          review: 0,
          failed: 0,
          subtasks: [
            expect.objectContaining({
              description: "Please verify docs.",
              status: "backlog",
            }),
          ],
        },
      ]);
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        taskId: task.id,
        runAgentId: mentionedAgent.id,
        subtask: { agentId: mentionedAgent.id, description: "Please verify docs." },
        feedback: { id: feedback.json<{ id: string }>().id },
      });
      // Agent assignment is verified via the JSON above; the run prompt no
      // longer embeds internal IDs like AssignedAgentId.
      expect(preview.json<{ renderedPrompt: string }>().renderedPrompt).toContain("<Task>");
      expect(subtask.statusCode).toBe(201);
      expect(updatedSubtask.statusCode).toBe(200);
      expect(updatedSubtask.json()).toMatchObject({
        agentId: agent.id,
        description: "Docs check updated",
      });
      expect(subtasks.statusCode).toBe(200);
      expect(subtasks.json()).toHaveLength(2);
      expect(template.statusCode).toBe(201);
      expect(template.json().defaultAgentId).toBe(agent.id);
      expect(template.json()).not.toHaveProperty("archived");
      expect(template.json()).not.toHaveProperty("archivedAt");
      expect(template.json()).not.toHaveProperty("status");
      expect(templates.statusCode).toBe(200);
      expect(templates.json()).toHaveLength(1);
      expect(templateDetail.statusCode).toBe(200);
      expect(templateDetail.json().id).toBe(template.json<{ id: string }>().id);
      expect(updatedTemplate.statusCode).toBe(200);
      expect(updatedTemplate.json()).toMatchObject({
        title: "Updated daily template",
        description: "Updated prompt.",
      });
      expect(updatedTemplate.json()).not.toHaveProperty("recurrence");
      expect(createdFromTemplate.statusCode).toBe(201);
      expect(createdFromTemplate.json().sourceTemplateId).toBe(template.json<{ id: string }>().id);
      expect(createdFromTemplate.json().title).toBe("Updated daily template #M1");
      expect(templateTasks.statusCode).toBe(200);
      expect(templateTasks.json().length).toBeGreaterThan(0);
      expect(runNow.statusCode).toBe(200);
      expect(runNow.json().status).toBe("queued");
      expect(runNow.json().triggerSource).toBe("manual");
      expect(runNow.json().context).toEqual({ text: "manual check", attachments: [] });
      const runNowTask = await taskService.get(runNow.json<{ taskId: string }>().taskId);
      expect(runNowTask?.title).toBe("Updated daily template #M2");
      expect(runNowTask).toMatchObject({
        context: {
          text: "manual check",
          attachments: [
            {
              filename: "template-notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
            },
          ],
        },
      });
      const runNowAttachmentKeyParts =
        runNowTask?.context.attachments[0]?.storageKey.split("/") ?? [];
      expect(runNowAttachmentKeyParts[0]).toBe("specialists");
      expect(runNowAttachmentKeyParts[2]).toBe("tasks");
      expect(runNowAttachmentKeyParts[3]).toBe(runNow.json<{ taskId: string }>().taskId);
      expect(runNowAttachmentKeyParts[4]).toBe("context-attachments");
    } finally {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("creates pending followups through the route", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Create followup");
      const response = await harness.server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups`,
        payload: { body: "Please double-check the docs." },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        taskId: task.id,
        runId: run.id,
        kind: "operator_reply",
        status: "pending",
        body: "Please double-check the docs.",
      });
    } finally {
      await harness.close();
    }
  });

  it("lists followups for the requested run", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "List followups");
      await harness.taskService.createFollowup(run.id, { body: "First reply." });
      await harness.taskService.createFollowup(run.id, { body: "Second reply." });

      const response = await harness.server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
      expect(response.json()).toMatchObject([
        { body: "First reply.", status: "pending" },
        { body: "Second reply.", status: "pending" },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("updates pending followups through the route", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Update followup");
      const followup = await harness.taskService.createFollowup(run.id, { body: "Old reply." });
      const response = await harness.server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups/${followup.id}`,
        payload: { body: "New reply." },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: followup.id,
        body: "New reply.",
        status: "pending",
      });
    } finally {
      await harness.close();
    }
  });

  it("deletes pending followups through the route", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Delete followup");
      const followup = await harness.taskService.createFollowup(run.id, { body: "Delete me." });
      const deleted = await harness.server.inject({
        method: "DELETE",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups/${followup.id}`,
      });
      const listed = await harness.server.inject({
        method: "GET",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups`,
      });

      expect(deleted.statusCode).toBe(204);
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("continues a terminal run from the continue route", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Continue route");
      await harness.taskService.createFollowup(run.id, { body: "Please fix the last issue." });
      const response = await harness.server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/runs/${run.id}/continue`,
      });
      const followups = await harness.taskService.listFollowups(run.id);
      const taskAfter = await harness.taskService.get(task.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("running");
      expect(followups.map((followup) => followup.status)).toEqual(["sent"]);
      expect(taskAfter?.status).toBe("queued");
    } finally {
      await harness.close();
    }
  });

  it("returns conflict when continuing a run without a recorded session", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const agent = await insertAgent(harness.testDb.client.db);
      const task = await harness.taskService.create({
        agentId: agent.id,
        title: "No session continue route",
      });
      const run = await harness.taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "completed",
        triggerSource: "manual",
        renderedPrompt: "Initial run.",
      });
      const response = await harness.server.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/runs/${run.id}/continue`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toBe("Task run does not have an OpenCode session.");
    } finally {
      await harness.close();
    }
  });

  it("returns not found when a followup route uses a run from another task", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Wrong task followups");
      const otherTask = await harness.taskService.create({
        agentId: task.agentId,
        title: "Other task",
      });
      const response = await harness.server.inject({
        method: "GET",
        url: `/api/tasks/${otherTask.id}/runs/${run.id}/followups`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.message).toBe("Task run not found.");
    } finally {
      await harness.close();
    }
  });

  it("returns not found when a continue route uses a run from another task", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Wrong task continue");
      const otherTask = await harness.taskService.create({
        agentId: task.agentId,
        title: "Other task",
      });
      const response = await harness.server.inject({
        method: "POST",
        url: `/api/tasks/${otherTask.id}/runs/${run.id}/continue`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.message).toBe("Task run not found.");
    } finally {
      await harness.close();
    }
  });

  it("returns not found when updating a missing followup id", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Missing followup update");
      const response = await harness.server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups/missing-followup`,
        payload: { body: "Change this." },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.message).toBe("Task run follow-up not found.");
    } finally {
      await harness.close();
    }
  });

  it("returns not found when deleting a missing followup id", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Missing followup delete");
      const response = await harness.server.inject({
        method: "DELETE",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups/missing-followup`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.message).toBe("Task run follow-up not found.");
    } finally {
      await harness.close();
    }
  });

  it("rejects followup edits once the followup has been sent", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const { task, run } = await createTerminalRunFixture(harness, "Sent followup edit");
      const followup = await harness.taskService.createFollowup(run.id, { body: "Keep this." });
      await harness.taskExecutionService.continueRunWithFollowups(run.id);
      const response = await harness.server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/runs/${run.id}/followups/${followup.id}`,
        payload: { body: "Change this." },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toBe("Only pending follow-ups can be edited.");
    } finally {
      await harness.close();
    }
  });

  it("updates feedback through the route before a derived subtask run starts", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const agent = await insertAgent(harness.testDb.client.db);
      const task = await harness.taskService.create({ agentId: agent.id, title: "Feedback edit" });
      const feedback = await harness.taskService.createFeedback(task.id, { body: "Old feedback." });
      const response = await harness.server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/feedback/${feedback.id}`,
        payload: { body: "Updated feedback." },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: feedback.id,
        body: "Updated feedback.",
        subtasks: [expect.objectContaining({ description: "Updated feedback." })],
      });
    } finally {
      await harness.close();
    }
  });

  it("rejects feedback edits after a derived subtask run has started", async () => {
    const harness = await createTaskRouteHarness();

    try {
      const agent = await insertAgent(harness.testDb.client.db);
      const task = await harness.taskService.create({
        agentId: agent.id,
        title: "Locked feedback",
      });
      const feedback = await harness.taskService.createFeedback(task.id, { body: "Old feedback." });
      await harness.taskExecutionService.queue(task.id, { triggerSource: "manual" });
      const response = await harness.server.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/feedback/${feedback.id}`,
        payload: { body: "Updated feedback." },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toBe(
        "Feedback cannot be edited after a subtask run has started.",
      );
    } finally {
      await harness.close();
    }
  });
});

async function createTaskRouteHarness() {
  const testDb = await createTestDatabase();
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const opencodeService = createMockOpenCodeService();
  const conversationService = createConversationService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService,
  });
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: testDb.config,
    taskService,
  });
  const taskExecutionService = createTaskExecutionService({
    db: testDb.client.db,
    taskService,
    conversationService,
    taskContextAttachmentService,
  });
  const taskSchedulerService = createTaskSchedulerService({
    db: testDb.client.db,
    taskService,
    executionService: taskExecutionService,
  });
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    orchestrator: createOrchestrator(),
    opencodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService({ delegate: taskSchedulerService }),
    taskService,
    taskExecutionService,
    taskSchedulerService,
  });

  return {
    testDb,
    taskService,
    taskExecutionService,
    server,
    close: async () => {
      taskSchedulerService.stop();
      await server.close();
      await testDb.cleanup();
    },
  };
}

async function createTerminalRunFixture(
  harness: Awaited<ReturnType<typeof createTaskRouteHarness>>,
  title: string,
) {
  const agent = await insertAgent(harness.testDb.client.db);
  const task = await harness.taskService.create({ agentId: agent.id, title });
  const queued = await harness.taskExecutionService.queue(task.id, { triggerSource: "manual" });

  await expect
    .poll(async () => (await harness.taskService.getRunById(queued.id))?.status)
    .toBe("running");

  await harness.taskService.setRunStatus(queued.id, "completed", {
    completedAt: "2026-06-01T12:30:00.000Z",
    finalMessage: "Finished.",
  });

  const run = await harness.taskService.getRunById(queued.id);

  if (!run) {
    throw new Error("Expected queued run.");
  }

  return { task, run };
}

async function insertAgent(db: AppDb): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${crypto.randomUUID()}`;
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Task Specialist",
      role: "help with tasks",
      instructions: "Be useful.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert test agent.");
  }

  return agent;
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  const sessions = new Map<string, OpenCodeSession>();
  const messages = new Map<string, OpenCodeSessionMessage[]>();
  let sessionCount = 0;
  let messageCount = 0;
  let time = Date.parse("2026-06-01T12:00:00.000Z");

  function nextTime(): number {
    time += 1_000;
    return time;
  }

  function nextMessageId(): string {
    messageCount += 1;
    return `message-${String(messageCount)}`;
  }

  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [],
        default: {},
        connected: [],
      }),
    ),
    listAuthMethods: vi.fn(() => Promise.resolve({})),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
    createSession: vi.fn((_directory: string, sessionOptions?: { title?: string }) => {
      sessionCount += 1;
      const session: OpenCodeSession = {
        id: `session-${String(sessionCount)}`,
        title: sessionOptions?.title,
        time: { created: nextTime(), updated: nextTime() },
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return Promise.resolve(session);
    }),
    getSession: vi.fn((_directory: string, sessionID: string) => {
      const session = sessions.get(sessionID);

      if (!session) {
        throw new Error("Session not found.");
      }

      return Promise.resolve(session);
    }),
    listSessionMessages: vi.fn((_directory: string, sessionID: string) =>
      Promise.resolve(messages.get(sessionID) ?? []),
    ),
    promptSession: vi.fn(({ sessionID, text }: { sessionID: string; text: string }) => {
      const session = sessions.get(sessionID);
      const sessionMessages = messages.get(sessionID);

      if (!session || !sessionMessages) {
        throw new Error("Session not found.");
      }

      const userMessageId = nextMessageId();
      const assistantMessageId = nextMessageId();
      sessionMessages.push({
        info: {
          id: userMessageId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [{ id: `part-${userMessageId}`, type: "text", text }],
      });
      const assistantMessage = {
        info: {
          id: assistantMessageId,
          sessionID,
          role: "assistant" as const,
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: `part-${assistantMessageId}`,
            type: "text",
            text: `Task finished: ${text}`,
          },
        ],
      };
      sessionMessages.push(assistantMessage);
      session.time.updated = nextTime();
      return Promise.resolve(assistantMessage);
    }),
    promptSessionAsync: vi.fn(),
    commandSession: vi.fn(),
    summarizeSession: vi.fn(),
    shellSession: vi.fn(),
    abortSession: vi.fn(),
    replyPermission: vi.fn(),
    replyQuestion: vi.fn(),
    rejectQuestion: vi.fn(),
    findText: vi.fn(),
    findFiles: vi.fn(),
    listFiles: vi.fn(),
    readFile: vi.fn(),
    getFileStatus: vi.fn(),
  } as unknown as OpenCodeService;
}
