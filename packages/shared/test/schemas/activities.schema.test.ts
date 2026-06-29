import { describe, expect, it } from "vitest";

import { reviewActivityPayloadSchema } from "../../src/schemas/activities.js";

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
});
