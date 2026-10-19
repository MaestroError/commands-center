// Keeps a blocked tool call's response stream from going silent.
//
// An operator-blocking tool holds its MCP response open while the operator reads
// a review form. The transport sends the SSE headers immediately and then writes
// nothing until the tool returns, so the body sits idle for the whole review.
//
// Measured against the runtime opencode actually ships (Bun 1.3.14, via
// `BUN_BE_BUN=1 opencode`): a fetch whose response body has been silent for
// 300 s is aborted with "TimeoutError: The operation timed out." — with or
// without the headers having been flushed first. The server never learns of it,
// keeps waiting, and happily applies the change when the operator clicks Apply;
// the specialist meanwhile sees only "-32001 Request timed out" and retries,
// creating a duplicate.
//
// So any wait longer than five minutes has to put a byte on its own stream.
// `notifications/message` is the cheapest carrier the protocol offers: the SDK
// routes it to this request's stream via `relatedRequestId`, and a client with
// no handler for it drops it silently instead of erroring.
export const STREAM_KEEPALIVE_INTERVAL_MS = 30_000;

type ToolNotification = {
  method: "notifications/message";
  params: { level: "debug"; logger: string; data: string };
};

export type StreamKeepaliveSender = (notification: ToolNotification) => Promise<void>;

// Runs `action`, beating on the request's stream until it settles. Beats are
// best-effort: once the client is gone, sending throws ("No connection
// established for request ID") and we simply stop.
export async function withStreamKeepalive<T>(
  sendNotification: StreamKeepaliveSender | undefined,
  action: () => Promise<T>,
  intervalMs: number = STREAM_KEEPALIVE_INTERVAL_MS,
): Promise<T> {
  if (!sendNotification) {
    return action();
  }

  const timer = setInterval(() => {
    void sendNotification({
      method: "notifications/message",
      params: { level: "debug", logger: "commandscenter", data: "tool call in progress" },
    }).catch(() => {
      clearInterval(timer);
    });
  }, intervalMs);

  // Never hold the process open for a heartbeat.
  timer.unref?.();

  try {
    return await action();
  } finally {
    clearInterval(timer);
  }
}
