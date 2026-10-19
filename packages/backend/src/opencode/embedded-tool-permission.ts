import type { OpenCode } from "@opencode/sdk";

export async function requestEmbeddedToolPermission(
  host: OpenCode.Interface,
  input: Parameters<OpenCode.Interface["permission"]["create"]>[0],
  signal?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  let requestID: string | undefined;
  try {
    const events = host.events.subscribe({
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    for await (const event of events) {
      if (event.type === "server.connected") {
        const result = await host.permission.create(input);
        if (result.effect === "allow") return;
        if (result.effect === "deny") throw new Error("Custom tool permission denied.");
        requestID = result.id;
      }
      if (
        event.type === "permission.replied" &&
        event.data.requestID === requestID &&
        event.data.sessionID === input.sessionID
      ) {
        if (event.data.reply === "reject") throw new Error("Custom tool permission rejected.");
        return;
      }
      if (
        ((event.type === "session.status" && event.data.status.type === "idle") ||
          event.type === "session.execution.interrupted" ||
          event.type === "session.idle") &&
        event.data.sessionID === input.sessionID
      ) {
        if (requestID) {
          try {
            await host.permission.reply({
              sessionID: input.sessionID,
              requestID,
              decision: "reject",
            });
          } catch (error) {
            if (!(error instanceof Error && error.name === "PermissionNotFoundError")) throw error;
          }
        }
        throw new Error("Custom tool request interrupted.");
      }
    }
    throw new Error("Custom tool permission stream closed.");
  } catch (cause) {
    if (signal?.aborted && requestID) {
      try {
        await host.permission.reply({ sessionID: input.sessionID, requestID, decision: "reject" });
      } catch (error) {
        if (!(error instanceof Error && error.name === "PermissionNotFoundError")) throw error;
      }
    }
    throw cause;
  } finally {
    controller.abort();
  }
}
