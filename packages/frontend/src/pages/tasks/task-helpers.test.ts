import { describe, expect, it } from "vitest";

import type { TaskRun } from "@cc/shared/schemas";

import { aggregateRunArtifacts, getTaskTemplateCreationPrefill } from "./task-helpers";

const validRecurrence = {
  mode: "recurring",
  anchorAt: "2026-07-08T09:00:00.000Z",
  timezone: "UTC",
  repeatRule: { frequency: "week", interval: 1 },
};

describe("getTaskTemplateCreationPrefill", () => {
  it("returns undefined when there is no templatePrefill", () => {
    expect(getTaskTemplateCreationPrefill(null)).toBeUndefined();
    expect(getTaskTemplateCreationPrefill({})).toBeUndefined();
    expect(getTaskTemplateCreationPrefill({ templatePrefill: 42 })).toBeUndefined();
  });

  it("returns undefined when a string field has the wrong type", () => {
    expect(getTaskTemplateCreationPrefill({ templatePrefill: { title: 123 } })).toBeUndefined();
  });

  it("passes through a valid recurrence", () => {
    const prefill = getTaskTemplateCreationPrefill({
      templatePrefill: {
        defaultAgentId: "agent-1",
        title: "Weekly digest",
        description: "body",
        recurrence: validRecurrence,
      },
    });

    expect(prefill).toMatchObject({
      defaultAgentId: "agent-1",
      title: "Weekly digest",
      description: "body",
    });
    expect(prefill?.recurrence?.repeatRule.frequency).toBe("week");
  });

  it("drops a malformed recurrence instead of passing it through", () => {
    const prefill = getTaskTemplateCreationPrefill({
      templatePrefill: {
        title: "No schedule",
        recurrence: { mode: "recurring", repeatRule: { frequency: "nonsense" } },
      },
    });

    expect(prefill?.title).toBe("No schedule");
    expect(prefill?.recurrence).toBeUndefined();
  });
});

describe("aggregateRunArtifacts", () => {
  it("builds an internal Documents URL for a document artifact", () => {
    const artifacts = aggregateRunArtifacts([
      {
        id: "run-1",
        taskId: "task-1",
        agentId: "agent-1",
        fallbackModels: [],
        status: "completed",
        triggerSource: "manual",
        renderedPrompt: "Create a document",
        needsHumanReview: false,
        hasActiveReply: false,
        artifacts: [
          {
            id: "artifact-1",
            conversationId: "conversation-1",
            title: "Overview",
            type: "document",
            link: "design/overview.md",
            createdAt: "2026-07-11T00:00:00.000Z",
            shareLinks: [],
          },
        ],
        createdAt: "2026-07-11T00:00:00.000Z",
        updatedAt: "2026-07-11T00:00:00.000Z",
      } satisfies TaskRun,
    ]);

    expect(artifacts[0]).toMatchObject({
      href: "/documents?path=design%2Foverview.md",
      external: false,
    });
  });
});
