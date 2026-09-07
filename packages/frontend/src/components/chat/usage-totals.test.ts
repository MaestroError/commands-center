import { describe, expect, it } from "vitest";

import type { UsageTotals } from "@cc/shared/schemas";

import { buildUsageTotalRows, formatUsageTotal, isUsagePartial } from "./usage-totals";

function totals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    tokens: { input: 1_000, output: 200, reasoning: 0, cacheRead: 300, cacheWrite: 0 },
    totalTokens: 1_500,
    messageCount: 4,
    assistantMessageCount: 2,
    countedMessageCount: 2,
    ...overrides,
  };
}

describe("formatUsageTotal", () => {
  it("renders a compact token count", () => {
    expect(formatUsageTotal(totals())).toBe("1.5k tokens");
  });

  it("renders a dash, not a zero, when nothing reported usage", () => {
    // "0 tokens" would assert something we do not know about these messages.
    expect(
      formatUsageTotal(totals({ tokens: undefined, totalTokens: 0, countedMessageCount: 0 })),
    ).toBe("—");
  });
});

describe("isUsagePartial", () => {
  it("is false when every reply reported usage", () => {
    expect(isUsagePartial(totals())).toBe(false);
  });

  it("is true when only some replies reported usage", () => {
    expect(isUsagePartial(totals({ assistantMessageCount: 5, countedMessageCount: 2 }))).toBe(true);
  });

  it("is false when nothing reported at all — that is unknown, not partial", () => {
    expect(
      isUsagePartial(totals({ tokens: undefined, totalTokens: 0, countedMessageCount: 0 })),
    ).toBe(false);
  });
});

describe("buildUsageTotalRows", () => {
  it("breaks the total into its components", () => {
    const rows = buildUsageTotalRows(totals());

    expect(rows).toContainEqual({ label: "Total tokens", value: "1,500" });
    expect(rows).toContainEqual({ label: "Input", value: "1,000" });
    expect(rows).toContainEqual({ label: "Cache read", value: "300" });
    // Zero components are omitted rather than shown as noise.
    expect(rows.map((row) => row.label)).not.toContain("Reasoning");
    expect(rows.map((row) => row.label)).not.toContain("Cost");
  });

  it("includes cost when a provider billed for the work", () => {
    const rows = buildUsageTotalRows(totals({ cost: 0.0155 }));

    expect(rows).toContainEqual({ label: "Cost", value: "$0.0155" });
  });

  it("declares coverage when only some replies reported", () => {
    const rows = buildUsageTotalRows(totals({ assistantMessageCount: 5, countedMessageCount: 2 }));

    expect(rows).toContainEqual({
      label: "Coverage",
      value: "2 of 5 replies",
      detail: true,
    });
  });

  it("explains an unknown total instead of listing zeroes", () => {
    const rows = buildUsageTotalRows(
      totals({ tokens: undefined, totalTokens: 0, countedMessageCount: 0 }),
    );

    expect(rows).toEqual([{ label: "Usage", value: "Not recorded for these messages" }]);
  });

  it("distinguishes an empty scope from an unrecorded one", () => {
    const rows = buildUsageTotalRows(
      totals({
        tokens: undefined,
        totalTokens: 0,
        messageCount: 0,
        assistantMessageCount: 0,
        countedMessageCount: 0,
      }),
    );

    expect(rows).toEqual([{ label: "Usage", value: "No messages yet" }]);
  });
});
