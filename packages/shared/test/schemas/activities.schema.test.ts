import { describe, expect, it } from "vitest";

import {
  activityKindSchema,
  reviewActivityPayloadSchema,
  runCommandProposalPayloadSchema,
  runTemplateProposalPayloadSchema,
  taskProposalPayloadSchema,
} from "../../src/schemas/activities.js";

describe("activity schemas", () => {
  describe("reviewActivityPayloadSchema", () => {
    it("parses a review payload with a question and suggested replies", () => {
      expect(
        reviewActivityPayloadSchema.parse({
          taskId: "task-1",
          taskRunId: "run-1",
          question: "Which option should I ship?",
          suggestedReplies: ["Ship option A", "Ship option B"],
        }),
      ).toEqual({
        taskId: "task-1",
        taskRunId: "run-1",
        question: "Which option should I ship?",
        suggestedReplies: ["Ship option A", "Ship option B"],
      });
    });

    it("parses feedback review payloads with a subtask id and artifacts", () => {
      expect(
        reviewActivityPayloadSchema.parse({
          taskId: "task-1",
          taskRunId: "run-1",
          subtaskId: "subtask-1",
          artifacts: [
            {
              title: "Review report",
              type: "file",
              link: "reports/review.md",
            },
          ],
        }),
      ).toEqual({
        taskId: "task-1",
        taskRunId: "run-1",
        subtaskId: "subtask-1",
        artifacts: [
          {
            title: "Review report",
            type: "file",
            link: "reports/review.md",
          },
        ],
      });
    });

    it("rejects suggested replies when the question is missing", () => {
      expect(() =>
        reviewActivityPayloadSchema.parse({
          taskId: "task-1",
          taskRunId: "run-1",
          suggestedReplies: ["Proceed"],
        }),
      ).toThrow("Question is required when suggested replies are provided.");
    });

    it("rejects more than six suggested replies", () => {
      expect(() =>
        reviewActivityPayloadSchema.parse({
          taskId: "task-1",
          taskRunId: "run-1",
          question: "Choose a path.",
          suggestedReplies: ["1", "2", "3", "4", "5", "6", "7"],
        }),
      ).toThrow();
    });
  });

  describe("specialist notification kinds", () => {
    it("includes the specialist notification kinds", () => {
      for (const kind of [
        "specialist_info",
        "specialist_warning",
        "task_proposal",
        "task_template_proposal",
        "run_template_proposal",
        "run_command_proposal",
      ]) {
        expect(activityKindSchema.safeParse(kind).success).toBe(true);
      }
    });

    it("parses a task proposal payload", () => {
      expect(
        taskProposalPayloadSchema.parse({
          title: "Draft the report",
          reason: "The run surfaced a follow-up",
          assigneeSlug: "writer",
          proposedBySlug: "researcher",
        }),
      ).toMatchObject({ title: "Draft the report", assigneeSlug: "writer" });
    });

    it("requires a template id on a run-template proposal", () => {
      expect(() => runTemplateProposalPayloadSchema.parse({ reason: "run it" })).toThrow();
    });

    it("requires a command on a run-command proposal", () => {
      expect(() => runCommandProposalPayloadSchema.parse({ reason: "no command" })).toThrow();
      expect(runCommandProposalPayloadSchema.parse({ command: "ls -la" })).toMatchObject({
        command: "ls -la",
      });
    });
  });
});
