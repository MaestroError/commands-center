import { describe, expect, it } from "vitest";

import {
  blockingWaitBudgetMs,
  CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS,
  CC_MANAGED_MCP_TIMEOUT_MS,
} from "../../../src/mcp/cc-managed/live-request-timeouts";

describe("blockingWaitBudgetMs", () => {
  it("reserves a minute of headroom for the groups in use", () => {
    expect(blockingWaitBudgetMs(CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS)).toBe(9 * 60 * 1000);
    expect(blockingWaitBudgetMs(CC_MANAGED_MCP_TIMEOUT_MS)).toBe(29 * 60 * 1000);
  });

  // The invariant this module exists for. A budget at or above the caller's
  // timeout puts the wait back outside the caller's lifetime: the operator's
  // Apply lands after the client gave up, the write happens anyway, and the
  // agent reports a timeout for work that succeeded.
  it("stays strictly under the caller's timeout, including windows too short for the full margin", () => {
    for (const toolCallTimeoutMs of [
      15 * 1000,
      30 * 1000,
      60 * 1000,
      90 * 1000,
      120 * 1000,
      121 * 1000,
      10 * 60 * 1000,
      30 * 60 * 1000,
    ]) {
      const budget = blockingWaitBudgetMs(toolCallTimeoutMs);

      expect(budget).toBeLessThan(toolCallTimeoutMs);
      expect(budget).toBeGreaterThan(0);
    }
  });

  it("returns nothing to wait on for a non-positive timeout", () => {
    expect(blockingWaitBudgetMs(0)).toBe(0);
    expect(blockingWaitBudgetMs(-1_000)).toBe(0);
  });
});
