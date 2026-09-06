import { describe, expect, it } from "vitest";

import type { ConversationMessage, ConversationPart, Provider } from "@cc/shared/schemas";

import { formatContextCount, formatContextSummary, readContextWindow } from "./context-window";

function provider(id: string, models: Record<string, unknown>): Provider {
  return { id, name: id, source: "api", env: [], models } as Provider;
}

const PROVIDERS: Provider[] = [
  provider("anthropic", { "claude-opus-5": { limit: { context: 1_000_000, output: 128_000 } } }),
  // The same model, a smaller window: the limit is per provider, not per model.
  provider("xpersona", { "claude-opus-5": { limit: { context: 372_000 } } }),
  provider("nolimits", { "mystery-model": {} }),
];

function assistant(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "assistant",
    content: "hi",
    parts: [],
    attachments: [],
    modelId: "claude-opus-5",
    providerId: "anthropic",
    tokens: { input: 400_000, output: 5_000, reasoning: 0, cacheRead: 121_600, cacheWrite: 0 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:10.000Z",
    ...overrides,
  };
}

function read(messages: ConversationMessage[], fallbackModel?: string) {
  return readContextWindow({
    messages,
    parts: {},
    providers: PROVIDERS,
    ...(fallbackModel === undefined ? {} : { fallbackModel }),
  });
}

describe("readContextWindow", () => {
  it("counts the prompt the model received: fresh input plus cache reads", () => {
    const context = read([assistant()]);

    // input + cacheRead + output: what the window holds going into the next turn.
    expect(context?.usedTokens).toBe(526_600);
    expect(context?.limitTokens).toBe(1_000_000);
    expect(formatContextSummary(context!)).toBe("526.6k / 1M (53%)");
  });

  it("uses the newest assistant turn, not the first", () => {
    const context = read([
      assistant({
        id: "old",
        tokens: { input: 10, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      assistant({
        id: "new",
        tokens: { input: 900, output: 0, reasoning: 0, cacheRead: 100, cacheWrite: 0 },
      }),
    ]);

    expect(context?.usedTokens).toBe(1_000);
  });

  it("ignores a compaction's own turns, which report the summarization request", () => {
    // Shape taken from real sessions: a full window, two summary turns whose
    // counts describe the summarize call, then the genuinely reduced context.
    const context = read([
      assistant({
        id: "full",
        tokens: { input: 252_162, output: 132, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      assistant({
        id: "summary-1",
        summary: true,
        tokens: { input: 92_592, output: 2_237, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      assistant({
        id: "summary-2",
        summary: true,
        tokens: { input: 8_229, output: 1_930, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ]);

    // Reading summary-2 would claim ~10k — far below the real window.
    expect(context?.usedTokens).toBe(252_294);
  });

  it("falls to the reduced window on the first real turn after a compaction", () => {
    const context = read([
      assistant({
        id: "full",
        tokens: { input: 252_162, output: 132, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      assistant({
        id: "summary",
        summary: true,
        tokens: { input: 8_229, output: 1_930, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      assistant({
        id: "after",
        tokens: { input: 20_017, output: 163, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ]);

    expect(context?.usedTokens).toBe(20_180);
  });

  it("ignores a trailing summary turn (real data from a reported chat)", () => {
    // The chat that surfaced this: a real turn of 55,006 + 1,792 + 35, then a
    // summary turn of 440 + 80. Reading the summary reported "520 / 200k (0%)".
    const context = readContextWindow({
      messages: [
        assistant({
          id: "real",
          providerId: "opencode",
          modelId: "big-pickle",
          tokens: { input: 55_006, output: 35, reasoning: 0, cacheRead: 1_792, cacheWrite: 0 },
        }),
        assistant({
          id: "summary",
          summary: true,
          providerId: "opencode",
          modelId: "big-pickle",
          tokens: { input: 440, output: 80, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      ],
      parts: {},
      providers: [provider("opencode", { "big-pickle": { limit: { context: 200_000 } } })],
    });

    expect(context?.usedTokens).toBe(56_833);
    expect(formatContextSummary(context!)).toBe("56.8k / 200k (28%)");
  });

  it("resolves the limit per provider, so the same model can differ", () => {
    expect(read([assistant({ providerId: "anthropic" })])?.limitTokens).toBe(1_000_000);
    expect(read([assistant({ providerId: "xpersona" })])?.limitTokens).toBe(372_000);
  });

  it("falls back to the specialist model when a message names none", () => {
    const context = read(
      [assistant({ modelId: undefined, providerId: undefined })],
      "anthropic/claude-opus-5",
    );

    expect(context?.model).toBe("anthropic/claude-opus-5");
  });

  it("reads tokens from step-finish parts for messages stored before the columns", () => {
    const legacy = assistant({ id: "legacy", tokens: undefined, parts: [] });
    const parts: Record<string, ConversationPart[]> = {
      legacy: [
        {
          id: "sf",
          type: "step-finish",
          tokens: { input: 300, output: 10, reasoning: 0, cache: { read: 700, write: 0 } },
        } as ConversationPart,
      ],
    };

    const context = readContextWindow({
      messages: [legacy],
      parts,
      providers: PROVIDERS,
    });

    expect(context?.usedTokens).toBe(1_010);
  });

  it("clamps a window reported over its limit rather than showing past 100%", () => {
    const context = read([
      assistant({
        providerId: "xpersona",
        tokens: { input: 400_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ]);

    expect(context?.fraction).toBe(1);
    expect(formatContextSummary(context!)).toContain("(100%)");
  });

  it("shows nothing when there is no basis for a number", () => {
    expect(read([])).toBeNull();
    expect(read([assistant({ role: "user" })])).toBeNull();
    expect(read([assistant({ tokens: undefined, parts: [] })])).toBeNull();
    // A provider that advertises no context limit.
    expect(read([assistant({ providerId: "nolimits", modelId: "mystery-model" })])).toBeNull();
    // A model the catalogue does not know at all.
    expect(read([assistant({ providerId: "ghost", modelId: "ghost" })])).toBeNull();
  });
});

describe("formatContextCount", () => {
  it.each([
    [999, "999"],
    [1_000, "1k"],
    [521_600, "521.6k"],
    [1_000_000, "1M"],
    [1_050_000, "1.1M"],
  ])("formats %i as %s", (input, expected) => {
    expect(formatContextCount(input)).toBe(expected);
  });
});
