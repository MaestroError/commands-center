// Timeout budget for the operator-blocking tools (the draft_* review forms and
// the blocking run_self_task wait).
//
// Two independent clocks run while such a tool blocks:
//
//   1. The MCP client's tool-call timeout — the `timeout` we publish per group in
//      the specialist's opencode config (see workspace-entry-service). When it
//      expires the client abandons the call with "-32001 Request timed out".
//   2. The wait itself: the live request's TTL, or the run poll deadline.
//
// The client's cancellation never reaches the running tool: every MCP request is
// served by a fresh stateless server instance, so the `notifications/cancelled`
// that the client sends on timeout arrives at an instance that knows nothing
// about the in-flight call. Nothing stops the handler.
//
// A wait that outlives its caller therefore completes into the void: the operator
// clicks Apply, the template/task is really created, and the agent still reports a
// timeout — so a retry creates a duplicate. Every blocking wait must end *before*
// the caller's tool-call timeout, which is what blockingWaitBudgetMs enforces.
//
// The tool-call timeout is not the only clock the caller runs: its HTTP client
// abandons a response body that stays silent for 300 s (measured on Bun, the
// runtime opencode ships). That one is handled by the keepalive in
// stream-keepalive.ts rather than by shrinking the budget — the beats keep the
// stream alive so the budgets below remain the binding limit.

// Tool-call timeout published for cc_default_interactive.
export const CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS = 10 * 60 * 1000;

// Tool-call timeout published for interactive groups without an explicit value
// (cc_app). Matches the historical live-request window.
export const CC_MANAGED_MCP_TIMEOUT_MS = 30 * 60 * 1000;

// Headroom between the end of the wait and the caller giving up. Covers the
// round trip that still has to happen after the operator submits: applying the
// change, serializing the result, and writing it back over the open stream.
const BLOCKING_WAIT_MARGIN_MS = 60 * 1000;

// Longest a tool may block before it must give up, given its group's tool-call
// timeout. The result is always strictly less than that timeout, so the caller is
// still listening when the result comes back.
//
// A group whose whole window is too small to give up the full margin gets half of
// it instead: clamping to the margin there would hand back a budget *longer* than
// the caller waits, which is the very failure this module exists to prevent.
export function blockingWaitBudgetMs(toolCallTimeoutMs: number): number {
  if (toolCallTimeoutMs <= 0) {
    return 0;
  }

  return toolCallTimeoutMs > BLOCKING_WAIT_MARGIN_MS * 2
    ? toolCallTimeoutMs - BLOCKING_WAIT_MARGIN_MS
    : Math.floor(toolCallTimeoutMs / 2);
}
