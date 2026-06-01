import { describe, expect, it } from "vitest";

import {
  addTaskRunArtifactInputSchema,
  boardTaskStatusSchema,
  createTaskFeedbackInputSchema,
  createTaskRunInputSchema,
  markTaskRunNeedsReviewInputSchema,
  queueTaskInputSchema,
  setTaskRunResultInputSchema,
  taskFeedbackThreadSchema,
  taskRunArtifactSchema,
  taskRunOutcomeSchema,
  taskRunTriggerSourceSchema,
  taskTemplateRunNowInputSchema,
  taskSubtaskSchema,
  taskTemplateSchema,
} from "../../src/schemas/tasks.js";

describe("task schemas", () => {
  describe("board-oriented status schemas", () => {
    it("accepts board task statuses", () => {
      expect(boardTaskStatusSchema.parse("ready_to_check")).toBe("ready_to_check");
      expect(boardTaskStatusSchema.parse("review")).toBe("review");
    });

    it("rejects legacy statuses from the board status schema", () => {
      expect(() => boardTaskStatusSchema.parse("enabled")).toThrow();
    });

    it("accepts task run trigger sources for future queue paths", () => {
      expect(taskRunTriggerSourceSchema.parse("api")).toBe("api");
      expect(taskRunTriggerSourceSchema.parse("template")).toBe("template");
    });

    it("accepts terminal task run outcomes", () => {
      expect(taskRunOutcomeSchema.parse("success")).toBe("success");
      expect(taskRunOutcomeSchema.parse("needs_human_review")).toBe("needs_human_review");
    });
  });

  describe("queueTaskInputSchema", () => {
    it("defaults manual queue trigger source", () => {
      expect(queueTaskInputSchema.parse({ taskId: "task-1" })).toEqual({
        taskId: "task-1",
        triggerSource: "manual",
      });
    });

    it("accepts subtask, agent override, and metadata", () => {
      expect(
        queueTaskInputSchema.parse({
          taskId: "task-1",
          subtaskId: "subtask-1",
          agentId: "agent-2",
          triggerSource: "scheduled",
          metadata: { scheduledAt: "2026-06-01T12:00:00.000Z" },
        }),
      ).toEqual({
        taskId: "task-1",
        subtaskId: "subtask-1",
        agentId: "agent-2",
        triggerSource: "scheduled",
        metadata: { scheduledAt: "2026-06-01T12:00:00.000Z" },
      });
    });
  });

  describe("taskTemplateRunNowInputSchema", () => {
    it("accepts optional context attachment uploads", () => {
      expect(
        taskTemplateRunNowInputSchema.parse({
          context: { text: "Run with this note." },
          contextAttachmentUploads: [
            {
              filename: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
              dataUrl: "data:text/plain;base64,aGVsbG8=",
            },
          ],
        }),
      ).toEqual({
        context: { text: "Run with this note.", attachments: [] },
        contextAttachmentUploads: [
          {
            filename: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
            dataUrl: "data:text/plain;base64,aGVsbG8=",
          },
        ],
      });
    });
  });

  describe("task feedback and subtasks", () => {
    it("accepts task feedback with created subtasks", () => {
      expect(
        taskFeedbackThreadSchema.parse({
          id: "feedback-1",
          taskId: "task-1",
          body: "Please simplify the implementation.",
          targetAgentIds: ["agent-1"],
          subtasks: [
            {
              id: "subtask-1",
              taskId: "task-1",
              feedbackId: "feedback-1",
              agentId: "agent-1",
              description: "Please simplify the implementation.",
              status: "backlog",
              replies: [],
              createdAt: "2026-06-01T12:00:00.000Z",
              updatedAt: "2026-06-01T12:00:00.000Z",
            },
          ],
          createdAt: "2026-06-01T12:00:00.000Z",
        }),
      ).toMatchObject({
        id: "feedback-1",
        targetAgentIds: ["agent-1"],
      });
    });

    it("rejects empty task feedback", () => {
      expect(() => createTaskFeedbackInputSchema.parse({ body: "" })).toThrow();
    });

    it("rejects feedback delegated to more than one mentioned agent", () => {
      expect(() =>
        createTaskFeedbackInputSchema.parse({
          body: "Please inspect this section.",
          mentionedAgentIds: ["agent-1", "agent-2"],
        }),
      ).toThrow();
    });

    it("accepts simple agent-assigned subtasks", () => {
      expect(
        taskSubtaskSchema.parse({
          id: "subtask-1",
          taskId: "task-1",
          feedbackId: "feedback-1",
          agentId: "agent-1",
          description: "Add retry coverage.",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:05:00.000Z",
        }),
      ).toMatchObject({
        id: "subtask-1",
        agentId: "agent-1",
      });
    });
  });

  describe("taskTemplateSchema", () => {
    it("accepts recurring task generator contracts", () => {
      expect(
        taskTemplateSchema.parse({
          id: "template-1",
          defaultAgentId: "agent-1",
          title: "Weekly status",
          description: "Summarize progress.",
          todos: [],
          recurrence: {
            mode: "recurring",
            anchorAt: "2026-06-01T09:00:00.000Z",
            timezone: "UTC",
            repeatRule: { frequency: "week", interval: 1 },
          },
          enabled: true,
          nextOccurrenceAt: "2026-06-08T09:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
          updatedAt: "2026-06-01T09:00:00.000Z",
        }),
      ).toMatchObject({
        id: "template-1",
        recurrence: { mode: "recurring" },
      });
    });
  });

  describe("taskRunArtifactSchema", () => {
    it("accepts artifacts with a path", () => {
      expect(
        taskRunArtifactSchema.parse({
          title: "Report",
          description: "Generated report.",
          path: "reports/output.md",
        }),
      ).toEqual({
        title: "Report",
        description: "Generated report.",
        path: "reports/output.md",
      });
    });

    it("accepts artifacts with a URL", () => {
      expect(
        taskRunArtifactSchema.parse({
          title: "Preview",
          url: "https://example.com/preview",
        }),
      ).toEqual({
        title: "Preview",
        url: "https://example.com/preview",
      });
    });

    it("rejects artifacts without a path or URL", () => {
      expect(() => taskRunArtifactSchema.parse({ title: "Missing output" })).toThrow(
        "Exactly one of url or path is required.",
      );
    });

    it("rejects artifacts with both a path and URL", () => {
      expect(() =>
        taskRunArtifactSchema.parse({
          title: "Ambiguous output",
          path: "reports/output.md",
          url: "https://example.com/output",
        }),
      ).toThrow("Exactly one of url or path is required.");
    });
  });

  describe("task run outcome tool input schemas", () => {
    it("parses result text input", () => {
      expect(
        setTaskRunResultInputSchema.parse({
          taskRunId: "run-1",
          resultText: "Finished successfully.",
        }),
      ).toEqual({ taskRunId: "run-1", resultText: "Finished successfully." });
    });

    it("parses artifact input", () => {
      expect(
        addTaskRunArtifactInputSchema.parse({
          taskRunId: "run-1",
          artifact: { title: "Report", path: "reports/output.md" },
        }),
      ).toEqual({
        taskRunId: "run-1",
        artifact: { title: "Report", path: "reports/output.md" },
      });
    });

    it("parses human-review input", () => {
      expect(
        markTaskRunNeedsReviewInputSchema.parse({
          taskRunId: "run-1",
          reason: "Needs approval.",
        }),
      ).toEqual({ taskRunId: "run-1", reason: "Needs approval." });
    });
  });

  describe("createTaskRunInputSchema", () => {
    it("applies task run defaults", () => {
      expect(
        createTaskRunInputSchema.parse({
          taskId: "task-1",
          agentId: "agent-1",
          triggerSource: "manual",
        }),
      ).toEqual({
        taskId: "task-1",
        agentId: "agent-1",
        status: "queued",
        triggerSource: "manual",
        renderedPrompt: "",
        artifacts: [],
        needsHumanReview: false,
      });
    });

    it("preserves a provided task run ID", () => {
      expect(
        createTaskRunInputSchema.parse({
          id: "run-1",
          taskId: "task-1",
          agentId: "agent-1",
          triggerSource: "manual",
        }).id,
      ).toBe("run-1");
    });

    it("accepts run outcome and subtask targeting", () => {
      expect(
        createTaskRunInputSchema.parse({
          taskId: "task-1",
          subtaskId: "subtask-1",
          agentId: "agent-1",
          triggerSource: "api",
          outcome: "success",
          triggerMetadata: { requestId: "request-1" },
        }),
      ).toMatchObject({
        taskId: "task-1",
        subtaskId: "subtask-1",
        triggerSource: "api",
        outcome: "success",
        triggerMetadata: { requestId: "request-1" },
      });
    });
  });
});
