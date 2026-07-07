import { describe, expect, it } from "vitest";

import { getTaskTemplateCreationPrefill } from "./task-helpers";

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
