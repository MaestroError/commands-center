export const CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS = 10 * 60 * 1000;

// Preserve the existing operator review window for groups without an explicit budget.
export const CC_TOOL_CALL_TIMEOUT_MS = 30 * 60 * 1000;

const BLOCKING_WAIT_MARGIN_MS = 60 * 1000;

export function blockingWaitBudgetMs(toolCallTimeoutMs: number): number {
  if (toolCallTimeoutMs <= 0) {
    return 0;
  }

  return toolCallTimeoutMs > BLOCKING_WAIT_MARGIN_MS * 2
    ? toolCallTimeoutMs - BLOCKING_WAIT_MARGIN_MS
    : Math.floor(toolCallTimeoutMs / 2);
}
