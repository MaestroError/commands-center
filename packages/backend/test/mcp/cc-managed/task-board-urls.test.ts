import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../../src/lib/runtime-config.js";
import {
  buildTaskBoardUrl,
  buildTaskTemplateBoardUrl,
  withTaskBoardUrl,
  withTaskRunBoardUrl,
  withTaskTemplateBoardUrl,
} from "../../../src/mcp/cc-managed/task-board-urls.js";

const config = loadRuntimeConfig({
  cwd: "/tmp/cc",
  env: {
    CC_PUBLIC_ORIGIN: "https://cc.example.test",
    CC_SECRET_KEY: "test-secret",
  },
});

describe("task board URLs", () => {
  it("builds a board URL for tasks", () => {
    expect(buildTaskBoardUrl(config, "task-123")).toBe(
      "https://cc.example.test/tasks?task=task-123",
    );
  });

  it("builds a board URL for task templates", () => {
    expect(buildTaskTemplateBoardUrl(config, "template-123")).toBe(
      "https://cc.example.test/tasks?view=templates&template=template-123",
    );
  });

  it("adds a URL to task records", () => {
    expect(
      withTaskBoardUrl(config, {
        id: "task-123",
        agentId: "agent-123",
        fallbackModels: [],
        title: "Task",
        description: "",
        context: { attachments: [] },
        todos: [],
        status: "backlog",
        enabled: true,
        archived: false,
        createdAt: "2026-06-25T11:00:00.000Z",
        updatedAt: "2026-06-25T11:00:00.000Z",
      }),
    ).toMatchObject({
      id: "task-123",
      url: "https://cc.example.test/tasks?task=task-123",
    });
  });

  it("adds a task URL to task runs", () => {
    expect(
      withTaskRunBoardUrl(config, {
        id: "run-123",
        taskId: "task-123",
        agentId: "agent-123",
        fallbackModels: [],
        status: "queued",
        triggerSource: "manual",
        renderedPrompt: "",
        artifacts: [],
        needsHumanReview: false,
        hasActiveReply: false,
        createdAt: "2026-06-25T11:00:00.000Z",
        updatedAt: "2026-06-25T11:00:00.000Z",
      }),
    ).toMatchObject({
      id: "run-123",
      taskUrl: "https://cc.example.test/tasks?task=task-123",
    });
  });

  it("adds a URL to task template records", () => {
    expect(
      withTaskTemplateBoardUrl(config, {
        id: "template-123",
        defaultAgentId: "agent-123",
        fallbackModels: [],
        title: "Template",
        description: "",
        todos: [],
        mcpConfig: {
          syncEnabled: true,
          asyncAlwaysAcknowledge: false,
          toolName: "template",
          toolDescription: "",
          textFieldDescription: "",
          allowFiles: true,
          filesFieldDescription: "",
          asyncEnabled: false,
          artifacts: { displayableUrlEnabled: true, downloadableUrlEnabled: true },
        },
        enabled: true,
        createdAt: "2026-06-25T11:00:00.000Z",
        updatedAt: "2026-06-25T11:00:00.000Z",
      }),
    ).toMatchObject({
      id: "template-123",
      url: "https://cc.example.test/tasks?view=templates&template=template-123",
    });
  });
});
