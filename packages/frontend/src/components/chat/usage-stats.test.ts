import { describe, expect, it } from "vitest";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import {
  buildMessageUsageRows,
  buildToolUsageRows,
  formatCompactCount,
  formatCost,
  formatDuration,
  readMessageUsage,
  readToolUsage,
} from "./usage-stats";

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "assistant",
    content: "hi",
    parts: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:12.500Z",
    ...overrides,
  };
}

// Mirrors a real `step-finish` part as stored in parts_json.
function makeStepFinish(overrides: Record<string, unknown> = {}): ConversationPart {
  return {
    id: "prt-step",
    type: "step-finish",
    reason: "tool-calls",
    cost: 0,
    tokens: {
      total: 47_335,
      input: 46_890,
      output: 232,
      reasoning: 213,
      cache: { read: 0, write: 0 },
    },
    ...overrides,
  } as ConversationPart;
}

function makeToolPart(state: Record<string, unknown>): ConversationPart {
  return { id: "prt-tool", type: "tool", tool: "read", state } as ConversationPart;
}

describe("readMessageUsage", () => {
  it("reads tokens and duration off a single step-finish part", () => {
    const usage = readMessageUsage(makeMessage(), [makeStepFinish()]);

    expect(usage).toMatchObject({
      steps: 1,
      durationMs: 12_500,
      tokens: { input: 46_890, output: 232, reasoning: 213, total: 47_335 },
    });
  });

  it("sums tokens and cost across multiple model steps", () => {
    const usage = readMessageUsage(makeMessage(), [
      makeStepFinish({
        id: "a",
        cost: 0.001,
        tokens: { total: 100, input: 80, output: 20, reasoning: 0, cache: { read: 5, write: 7 } },
      }),
      makeStepFinish({
        id: "b",
        cost: 0.002,
        tokens: { total: 50, input: 30, output: 20, reasoning: 0, cache: { read: 1, write: 0 } },
      }),
    ]);

    expect(usage?.steps).toBe(2);
    expect(usage?.tokens).toMatchObject({
      input: 110,
      output: 40,
      cacheRead: 6,
      cacheWrite: 7,
      total: 150,
    });
    expect(usage?.cost).toBeCloseTo(0.003, 6);
  });

  it("falls back to component sums when the provider omits a total", () => {
    const usage = readMessageUsage(makeMessage(), [
      makeStepFinish({
        tokens: { input: 10, output: 4, reasoning: 1, cache: { read: 0, write: 0 } },
      }),
    ]);

    expect(usage?.tokens?.total).toBe(15);
  });

  it("omits a zero cost, which means the provider does not bill per request", () => {
    const usage = readMessageUsage(makeMessage(), [makeStepFinish({ cost: 0 })]);

    expect(usage?.cost).toBeUndefined();
    expect(buildMessageUsageRows(usage!).map((row) => row.label)).not.toContain("Cost");
  });

  it("reports no duration while the message is still streaming", () => {
    const usage = readMessageUsage(
      makeMessage({ createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      [makeStepFinish()],
    );

    expect(usage?.durationMs).toBeUndefined();
  });

  it("ignores user messages and messages with nothing to report", () => {
    expect(readMessageUsage(makeMessage({ role: "user" }), [makeStepFinish()])).toBeNull();
    expect(
      readMessageUsage(
        makeMessage({
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        [],
      ),
    ).toBeNull();
  });
});

describe("readToolUsage", () => {
  it("reads start, end and duration off a completed tool call", () => {
    const usage = readToolUsage(
      makeToolPart({
        status: "completed",
        time: { start: 1_782_898_078_071, end: 1_782_898_078_075 },
      }),
    );

    expect(usage).toEqual({
      startedAt: 1_782_898_078_071,
      endedAt: 1_782_898_078_075,
      durationMs: 4,
    });
  });

  it("keeps the start time for a running call that has no end yet", () => {
    const usage = readToolUsage(makeToolPart({ status: "running", time: { start: 1_000 } }));

    expect(usage).toEqual({ startedAt: 1_000 });
    expect(buildToolUsageRows(usage!).map((row) => row.label)).toEqual(["Started"]);
  });

  it("returns null when the part carries no timing", () => {
    expect(readToolUsage(makeToolPart({ status: "pending" }))).toBeNull();
    expect(readToolUsage({ id: "p", type: "text" } as ConversationPart)).toBeNull();
  });
});

describe("formatting", () => {
  it.each([
    [4, "4ms"],
    [999, "999ms"],
    [1_400, "1.4s"],
    [12_500, "13s"],
    [60_000, "1m"],
    [83_000, "1m 23s"],
  ])("formats %ims as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it.each([
    [999, "999"],
    [1_400, "1.4k"],
    [47_335, "47k"],
    [1_500_000, "1.5M"],
  ])("compacts %i as %s", (input, expected) => {
    expect(formatCompactCount(input)).toBe(expected);
  });

  it("keeps enough precision for sub-cent costs", () => {
    expect(formatCost(0.00543618)).toBe("$0.00544");
    expect(formatCost(0.01558692)).toBe("$0.0156");
  });
});

describe("persisted usage takes precedence", () => {
  it("prefers the message's own figures over the step-finish parts", () => {
    const usage = readMessageUsage(
      makeMessage({
        tokens: {
          input: 1_000,
          output: 100,
          reasoning: 0,
          cacheRead: 50,
          cacheWrite: 20,
          total: 1_100,
        },
        cost: 0.004,
        modelId: "claude-opus-5",
        providerId: "anthropic",
      }),
      // Deliberately different numbers: if these win, the precedence is wrong.
      [makeStepFinish()],
    );

    expect(usage?.tokens).toEqual({
      input: 1_000,
      output: 100,
      reasoning: 0,
      cacheRead: 50,
      cacheWrite: 20,
      total: 1_100,
    });
    expect(usage?.cost).toBe(0.004);
    expect(usage?.model).toBe("anthropic/claude-opus-5");
  });

  it("falls back to step-finish for messages synced before the columns existed", () => {
    const usage = readMessageUsage(makeMessage(), [makeStepFinish()]);

    expect(usage?.tokens?.total).toBe(47_335);
    expect(usage?.model).toBeUndefined();
  });

  it("uses the bare model id when no provider is recorded", () => {
    const usage = readMessageUsage(makeMessage({ modelId: "gpt-5" }), []);

    expect(usage?.model).toBe("gpt-5");
    expect(buildMessageUsageRows(usage!)).toContainEqual({ label: "Model", value: "gpt-5" });
  });
});
