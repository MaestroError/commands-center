import { describe, expect, it } from "vitest";

import {
  addTaskRunArtifactInputSchema,
  createTaskRunInputSchema,
  markTaskRunNeedsReviewInputSchema,
  setTaskRunResultInputSchema,
  taskRunArtifactSchema,
} from "../../src/schemas/tasks.js";

describe("task schemas", () => {
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
  });
});
