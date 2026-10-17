import type { OpenCode } from "@opencode/sdk";

export async function requestEmbeddedToolPermission(
  host: OpenCode.Interface,
  input: Parameters<OpenCode.Interface["permission"]["create"]>[0],
): Promise<void> {
  const controller = new AbortController();
  try {
    const events = host.events.subscribe({ signal: controller.signal });
    let requestID: string | undefined;
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
  } finally {
    controller.abort();
  }
}
