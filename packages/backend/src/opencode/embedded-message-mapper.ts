import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import type { OpenCodeSessionMessage } from "../services/opencode-service.js";

export type EmbeddedMessage = Awaited<
  ReturnType<EmbeddedOpenCodeHost["sessions"]["message"]["get"]>
>;
type Part = OpenCodeSessionMessage["parts"][number];

export function embeddedPartId(messageID: string, kind: string, ordinal: number | string): string {
  return `${messageID}:${kind}:${String(ordinal)}`;
}

export function mapEmbeddedMessage(
  sessionID: string,
  message: EmbeddedMessage,
): OpenCodeSessionMessage | undefined {
  const info = {
    id: message.id,
    sessionID,
    role: message.type === "user" ? ("user" as const) : ("assistant" as const),
    time: message.time,
  };
  switch (message.type) {
    case "user":
      return {
        info,
        parts: [
          { id: embeddedPartId(message.id, "text", 0), type: "text", text: message.text },
          ...(message.files ?? []).map((file, index) => ({
            id: embeddedPartId(message.id, "file", index),
            type: "file",
            mime: file.mime,
            filename: file.name,
            url: `data:${file.mime};base64,${file.data}`,
            source: file.source,
          })),
        ],
      };
    case "assistant": {
      const ordinals = { text: 0, reasoning: 0 };
      return {
        info: {
          ...info,
          error: message.error
            ? {
                name: message.error.type,
                message: message.error.message,
                data: { statusCode: message.error.status },
              }
            : undefined,
        },
        parts: message.content.map((part): Part => {
          const id = embeddedPartId(
            message.id,
            part.type,
            part.type === "tool" ? part.id : ordinals[part.type]++,
          );
          if (part.type !== "tool") return { id, type: part.type, text: part.text };
          const state = part.state;
          const content = "content" in state ? (state.content ?? []) : [];
          return {
            id,
            type: "tool",
            callID: part.id,
            tool: part.name,
            state: {
              status: state.status === "streaming" ? "pending" : state.status,
              input: state.status === "streaming" ? {} : state.input,
              raw: state.status === "streaming" ? state.input : undefined,
              output: content
                .flatMap((item) => (item.type === "text" ? [item.text] : []))
                .join("\n"),
              error: state.status === "error" ? state.error.message : undefined,
              metadata: "metadata" in state ? state.metadata : undefined,
              time: { start: part.time.ran ?? part.time.created, end: part.time.completed },
              attachments: content.flatMap((item, fileIndex) =>
                item.type === "file"
                  ? [
                      {
                        id: `${id}:file:${String(fileIndex)}`,
                        type: "file",
                        mime: item.mime,
                        filename: item.name ?? undefined,
                        url: item.uri,
                      },
                    ]
                  : [],
              ),
            },
          };
        }),
      };
    }
    case "shell":
      return {
        info,
        parts: [
          {
            id: embeddedPartId(message.id, "tool", message.shellID),
            type: "tool",
            callID: message.shellID,
            tool: "bash",
            state: {
              status:
                message.status === "running"
                  ? "running"
                  : message.status === "exited" && message.exit === 0
                    ? "completed"
                    : "error",
              input: { command: message.command },
              output: message.output?.output ?? "",
              error:
                message.status === "timeout" || message.status === "killed"
                  ? message.status
                  : message.exit !== undefined && message.exit !== 0
                    ? `Process exited with code ${String(message.exit)}`
                    : undefined,
              time: { start: message.time.created, end: message.time.completed },
            },
          },
        ],
      };
    case "compaction":
      if (message.status === "failed") {
        return {
          info: { ...info, error: { name: message.error.type, message: message.error.message } },
          parts: [],
        };
      }
      return message.status === "completed"
        ? {
            info,
            parts: [
              { id: embeddedPartId(message.id, "text", 0), type: "text", text: message.summary },
            ],
          }
        : undefined;
    default:
      return undefined;
  }
}
