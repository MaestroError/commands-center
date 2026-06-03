import { describe, expect, it } from "vitest";

import {
  listPublicTasksQuerySchema,
  publicCreateTaskBodySchema,
  publicGetTaskQuerySchema,
  publicScheduleTaskBodySchema,
  publicTaskSchema,
  publicTaskTemplateSummarySchema,
  publicTriggerScheduleSchema,
  publicTriggerTaskBodySchema,
  publicTriggerTemplateBodySchema,
} from "../../src/schemas/public-api.js";

const futureIso = () => new Date(Date.now() + 60_000).toISOString();
const pastIso = () => new Date(Date.now() - 60_000).toISOString();

describe("public API schemas", () => {
  describe("publicTriggerScheduleSchema", () => {
    it("accepts a runAt in the future", () => {
      const runAt = futureIso();
      expect(publicTriggerScheduleSchema.parse({ runAt })).toEqual({ runAt });
    });

    it("rejects a runAt in the past", () => {
      expect(() => publicTriggerScheduleSchema.parse({ runAt: pastIso() })).toThrow(
        /must be in the future/,
      );
    });

    it("accepts an optional timezone", () => {
      const runAt = futureIso();
      expect(publicTriggerScheduleSchema.parse({ runAt, timezone: "UTC" })).toEqual({
        runAt,
        timezone: "UTC",
      });
    });
  });

  describe("publicScheduleTaskBodySchema", () => {
    it("accepts a future runAt", () => {
      const runAt = futureIso();
      expect(publicScheduleTaskBodySchema.parse({ runAt })).toEqual({ runAt });
    });

    it("accepts null runAt to clear the schedule", () => {
      expect(publicScheduleTaskBodySchema.parse({ runAt: null })).toEqual({ runAt: null });
    });

    it("rejects a past runAt", () => {
      expect(() => publicScheduleTaskBodySchema.parse({ runAt: pastIso() })).toThrow(
        /must be in the future/,
      );
    });
  });

  describe("body and query schemas", () => {
    it("parses a minimal trigger template body", () => {
      expect(publicTriggerTemplateBodySchema.parse({})).toEqual({});
    });

    it("parses a create task body", () => {
      const parsed = publicCreateTaskBodySchema.parse({
        agentId: "agent-1",
        title: "Do the thing",
      });
      expect(parsed.agentId).toBe("agent-1");
      expect(parsed.title).toBe("Do the thing");
    });

    it("rejects a create task body without an agentId", () => {
      expect(() => publicCreateTaskBodySchema.parse({ title: "x" })).toThrow();
    });

    it("parses an empty trigger task body", () => {
      expect(publicTriggerTaskBodySchema.parse({})).toEqual({});
    });

    it("parses list and get query schemas", () => {
      expect(listPublicTasksQuerySchema.parse({ status: "enabled" }).status).toBe("enabled");
      expect(publicGetTaskQuerySchema.parse({ expand: "runs,feedback" }).expand).toBe(
        "runs,feedback",
      );
    });
  });

  describe("projection schemas", () => {
    it("parses a template summary", () => {
      const summary = { id: "tpl-1", title: "Template", description: "" };
      expect(publicTaskTemplateSummarySchema.parse(summary)).toEqual(summary);
    });

    it("parses a task without optional expansions", () => {
      const now = new Date().toISOString();
      const task = publicTaskSchema.parse({
        id: "task-1",
        title: "Title",
        description: "",
        status: "enabled",
        agentId: "agent-1",
        todos: [],
        scheduledAt: null,
        dueAt: null,
        doneAt: null,
        latestRunId: null,
        latestFinalMessage: null,
        sourceTemplateId: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(task.id).toBe("task-1");
      expect(task.runs).toBeUndefined();
    });
  });
});
