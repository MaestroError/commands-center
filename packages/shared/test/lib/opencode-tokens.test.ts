import { describe, expect, it } from "vitest";

import {
  readOpenCodeCost,
  readOpenCodeTokens,
  sumOpenCodeTokens,
} from "../../src/lib/opencode-tokens";

describe("readOpenCodeTokens", () => {
  it("normalizes a real OpenCode report", () => {
    expect(
      readOpenCodeTokens({
        total: 47_335,
        input: 46_890,
        output: 232,
        reasoning: 213,
        cache: { read: 12_040, write: 3100 },
      }),
    ).toEqual({
      input: 46_890,
      output: 232,
      reasoning: 213,
      cacheRead: 12_040,
      cacheWrite: 3100,
      total: 47_335,
    });
  });

  it("derives a missing total from the components", () => {
    expect(readOpenCodeTokens({ input: 10, output: 4, reasoning: 1 })?.total).toBe(15);
  });

  it("prefers the reported total over its own arithmetic", () => {
    // Cache reads are real tokens the provider may or may not fold into the
    // total; whatever it says wins.
    expect(
      readOpenCodeTokens({ total: 99, input: 10, output: 4, cache: { read: 500, write: 0 } })
        ?.total,
    ).toBe(99);
  });

  it("treats a report with nothing in it as absent", () => {
    expect(
      readOpenCodeTokens({
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      }),
    ).toBeUndefined();
  });

  it("keeps a report whose only non-zero component is reasoning or cache", () => {
    // Regression: an emptiness check that looked at the total alone discarded
    // these whenever the provider also stamped an explicit `total: 0`.
    expect(readOpenCodeTokens({ total: 0, reasoning: 500 })).toMatchObject({ reasoning: 500 });
    expect(readOpenCodeTokens({ total: 0, cache: { read: 900, write: 0 } })).toMatchObject({
      cacheRead: 900,
    });
  });

  it("rejects malformed payloads", () => {
    expect(readOpenCodeTokens(undefined)).toBeUndefined();
    expect(readOpenCodeTokens("nope")).toBeUndefined();
    expect(readOpenCodeTokens([])).toBeUndefined();
    expect(readOpenCodeTokens({ input: -5, output: "x" })).toBeUndefined();
  });
});

describe("sumOpenCodeTokens", () => {
  it("adds up one report per model step", () => {
    expect(
      sumOpenCodeTokens([
        { total: 100, input: 80, output: 20, cache: { read: 5, write: 7 } },
        { total: 50, input: 30, output: 20, cache: { read: 1, write: 0 } },
      ]),
    ).toEqual({
      input: 110,
      output: 40,
      reasoning: 0,
      cacheRead: 6,
      cacheWrite: 7,
      total: 150,
    });
  });

  it("skips empty and malformed entries rather than counting them as zero", () => {
    expect(
      sumOpenCodeTokens([undefined, { input: 0, output: 0 }, { input: 5, output: 1 }]),
    ).toEqual({ input: 5, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 6 });
  });

  it("returns undefined when nothing reported anything", () => {
    expect(sumOpenCodeTokens([])).toBeUndefined();
    expect(sumOpenCodeTokens([undefined, { input: 0, output: 0 }])).toBeUndefined();
  });
});

describe("readOpenCodeCost", () => {
  it("keeps a billed cost", () => {
    expect(readOpenCodeCost(0.01558692)).toBe(0.01558692);
  });

  it("drops a zero, which means the provider does not bill per request", () => {
    expect(readOpenCodeCost(0)).toBeUndefined();
  });

  it("rejects non-numeric and negative values", () => {
    expect(readOpenCodeCost("free")).toBeUndefined();
    expect(readOpenCodeCost(-1)).toBeUndefined();
    expect(readOpenCodeCost(undefined)).toBeUndefined();
  });
});
