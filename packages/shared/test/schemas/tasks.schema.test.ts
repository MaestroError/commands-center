import { describe, expect, it } from "vitest";

import {
  addTaskRunArtifactInputSchema,
  boardTaskStatusSchema,
  createTaskFeedbackInputSchema,
  createTaskRunFollowupInputSchema,
  createTaskRunInputSchema,
  markTaskRunNeedsReviewInputSchema,
  persistedTaskRunArtifactSchema,
  queueTaskInputSchema,
  reviewQuestionSchema,
  setTaskRunResultInputSchema,
  taskFeedbackThreadSchema,
  taskRunArtifactSchema,
  taskRunFollowupSchema,
  taskRunOutcomeSchema,
  taskRunSchema,
  taskRunTriggerSourceSchema,
  taskTemplateRunNowInputSchema,
  taskSubtaskSchema,
  taskTemplateSchema,
  updateTaskTemplateInputSchema,
  updateTaskFeedbackInputSchema,
  updateTaskRunFollowupInputSchema,
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
      expect(taskRunTriggerSourceSchema.parse("agent")).toBe("agent");
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

    it("accepts feedback edits with trimmed bodies", () => {
      expect(
        updateTaskFeedbackInputSchema.parse({ body: "  Please revise the summary.  " }),
      ).toEqual({
        body: "Please revise the summary.",
      });
    });
  });

  describe("taskTemplateSchema", () => {
    it("keeps omitted fields absent in template updates", () => {
      expect(updateTaskTemplateInputSchema.parse({ enabled: true })).toEqual({
        enabled: true,
      });
    });

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
    it("accepts file artifacts", () => {
      expect(
        taskRunArtifactSchema.parse({
          title: "Report",
          description: "Generated report.",
          type: "file",
          link: "reports/output.md",
        }),
      ).toEqual({
        title: "Report",
        description: "Generated report.",
        type: "file",
        link: "reports/output.md",
      });
    });

    it("accepts URL artifacts", () => {
      expect(
        taskRunArtifactSchema.parse({
          title: "Preview",
          type: "url",
          link: "https://example.com/preview",
        }),
      ).toEqual({
        title: "Preview",
        type: "url",
        link: "https://example.com/preview",
      });
    });

    it("rejects artifacts without a type", () => {
      expect(() =>
        taskRunArtifactSchema.parse({ title: "Missing output", link: "reports/output.md" }),
      ).toThrow();
    });

    it("rejects URL artifacts with invalid links", () => {
      expect(() =>
        taskRunArtifactSchema.parse({
          title: "Ambiguous output",
          type: "url",
          link: "reports/output.md",
        }),
      ).toThrow();
    });

    it("normalizes legacy path artifacts from persisted storage", () => {
      expect(
        persistedTaskRunArtifactSchema.parse({
          title: "Report",
          path: "reports/output.md",
        }),
      ).toEqual({
        title: "Report",
        type: "file",
        link: "reports/output.md",
      });
    });

    it("normalizes legacy URL artifacts from persisted storage", () => {
      expect(
        persistedTaskRunArtifactSchema.parse({
          title: "Preview",
          url: "https://example.com/preview",
        }),
      ).toEqual({
        title: "Preview",
        type: "url",
        link: "https://example.com/preview",
      });
    });

    it("rejects legacy artifacts that provide both path and URL", () => {
      expect(() =>
        persistedTaskRunArtifactSchema.parse({
          title: "Ambiguous output",
          path: "reports/output.md",
          url: "https://example.com/preview",
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
          artifact: { title: "Report", type: "file", link: "reports/output.md" },
        }),
      ).toEqual({
        taskRunId: "run-1",
        artifact: { title: "Report", type: "file", link: "reports/output.md" },
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

    it("parses review questions with suggested replies", () => {
      expect(
        markTaskRunNeedsReviewInputSchema.parse({
          taskRunId: "run-1",
          reason: "Needs approval.",
          question: "Which option should I use?",
          suggestedReplies: ["Ship option A", "Ship option B"],
        }),
      ).toEqual({
        taskRunId: "run-1",
        reason: "Needs approval.",
        question: "Which option should I use?",
        suggestedReplies: ["Ship option A", "Ship option B"],
      });
    });

    it("rejects suggested replies without a question", () => {
      expect(() =>
        markTaskRunNeedsReviewInputSchema.parse({
          taskRunId: "run-1",
          suggestedReplies: ["Proceed"],
        }),
      ).toThrow("Question is required when suggested replies are provided.");
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
        fallbackModels: [],
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

  describe("task run followups", () => {
    it("parses persisted followups", () => {
      expect(
        taskRunFollowupSchema.parse({
          id: "followup-1",
          taskId: "task-1",
          runId: "run-1",
          kind: "review_answer",
          status: "sent",
          body: "Proceed with option A.",
          createdAt: "2026-06-01T12:00:00.000Z",
          sentAt: "2026-06-01T12:05:00.000Z",
        }),
      ).toMatchObject({
        id: "followup-1",
        kind: "review_answer",
        status: "sent",
      });
    });

    it("parses failed followup error messages", () => {
      expect(
        taskRunFollowupSchema.parse({
          id: "followup-1",
          taskId: "task-1",
          runId: "run-1",
          kind: "operator_reply",
          status: "failed",
          body: "Try again.",
          createdAt: "2026-06-01T12:00:00.000Z",
          errorMessage: "transport failed",
        }),
      ).toMatchObject({
        status: "failed",
        errorMessage: "transport failed",
      });
    });

    it("defaults followup creation kind to operator_reply", () => {
      expect(
        createTaskRunFollowupInputSchema.parse({ body: "  Please retry with logs.  " }),
      ).toEqual({
        body: "Please retry with logs.",
        kind: "operator_reply",
      });
    });

    it("rejects empty followup edits", () => {
      expect(() => updateTaskRunFollowupInputSchema.parse({ body: "   " })).toThrow();
    });
  });

  describe("review questions", () => {
    it("defaults suggested replies to an empty array", () => {
      expect(reviewQuestionSchema.parse({ question: "How should I proceed?" })).toEqual({
        question: "How should I proceed?",
        suggestedReplies: [],
      });
    });

    it("rejects more than six suggested replies", () => {
      expect(() =>
        reviewQuestionSchema.parse({
          question: "Pick one.",
          suggestedReplies: ["1", "2", "3", "4", "5", "6", "7"],
        }),
      ).toThrow();
    });
  });

  describe("taskRunSchema", () => {
    it("defaults pending followup count to zero", () => {
      expect(
        taskRunSchema.parse({
          id: "run-1",
          taskId: "task-1",
          agentId: "agent-1",
          fallbackModels: [],
          status: "completed",
          triggerSource: "manual",
          renderedPrompt: "",
          artifacts: [],
          needsHumanReview: false,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        }).pendingFollowupCount,
      ).toBe(0);
    });

    it("accepts an attached review question", () => {
      expect(
        taskRunSchema.parse({
          id: "run-1",
          taskId: "task-1",
          agentId: "agent-1",
          fallbackModels: [],
          status: "completed",
          triggerSource: "manual",
          renderedPrompt: "",
          artifacts: [],
          needsHumanReview: true,
          humanReviewReason: "Need operator input.",
          reviewQuestion: {
            question: "Which region should I deploy to?",
            suggestedReplies: ["us-east-1", "eu-west-1"],
          },
          pendingFollowupCount: 2,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        }).reviewQuestion,
      ).toEqual({
        question: "Which region should I deploy to?",
        suggestedReplies: ["us-east-1", "eu-west-1"],
      });
    });
  });
});
