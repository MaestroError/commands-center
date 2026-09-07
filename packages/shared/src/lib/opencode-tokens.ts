/**
 * OpenCode reports token usage in one shape in two places: on an assistant
 * message's `info`, and on each `step-finish` part. Both look like
 * `{ input, output, reasoning, cache: { read, write } }`, plus a `total` that
 * is absent from the SDK typings but present in practice.
 *
 * The backend normalizes the `info` report when persisting a message; the
 * frontend normalizes the `step-finish` parts when a message predates that
 * persistence or is still streaming. Both go through here so the two readings
 * of the same wire shape cannot drift apart.
 */

import type { ConversationMessageTokens } from "../schemas/conversations.js";

/**
 * Normalize one usage report. Returns undefined when the payload is malformed
 * or reports nothing at all — an empty report is an absence of data, and the
 * caller should fall back to another source rather than render zeroes.
 */
export function readOpenCodeTokens(value: unknown): ConversationMessageTokens | undefined {
  if (!isRecord(value)) return undefined;

  const input = readNonNegativeNumber(value["input"]) ?? 0;
  const output = readNonNegativeNumber(value["output"]) ?? 0;
  const reasoning = readNonNegativeNumber(value["reasoning"]) ?? 0;
  const cache = isRecord(value["cache"]) ? value["cache"] : undefined;
  const cacheRead = readNonNegativeNumber(cache?.["read"]) ?? 0;
  const cacheWrite = readNonNegativeNumber(cache?.["write"]) ?? 0;

  // Every component must be zero for the report to count as empty. Testing the
  // total alone would discard a reasoning-only report that also carries an
  // explicit `total: 0`.
  if (input === 0 && output === 0 && reasoning === 0 && cacheRead === 0 && cacheWrite === 0) {
    return undefined;
  }

  // Recorded, never trusted: providers disagree on what the total covers.
  const reportedTotal = readNonNegativeNumber(value["total"]);

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    ...(reportedTotal === undefined ? {} : { reportedTotal }),
  };
}

/**
 * Fold several usage reports into one. Each entry is a separate model call, so
 * the components add up; empty reports are skipped rather than counted as zero.
 */
export function sumOpenCodeTokens(values: unknown[]): ConversationMessageTokens | undefined {
  const totals: ConversationMessageTokens = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  let found = false;

  for (const value of values) {
    const tokens = readOpenCodeTokens(value);
    if (!tokens) continue;

    found = true;
    totals.input += tokens.input;
    totals.output += tokens.output;
    totals.reasoning += tokens.reasoning;
    totals.cacheRead += tokens.cacheRead;
    totals.cacheWrite += tokens.cacheWrite;
  }

  return found ? totals : undefined;
}

/**
 * A provider-reported cost in USD, or undefined when nothing billable was
 * reported. A literal 0 means the provider does not bill per request
 * (subscription and OAuth models), not that the request was free.
 */
export function readOpenCodeCost(value: unknown): number | undefined {
  const cost = readNonNegativeNumber(value);
  return cost !== undefined && cost > 0 ? cost : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
