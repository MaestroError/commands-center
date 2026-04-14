import {
  conversationAttachmentSchema,
  conversationMessageSchema,
  type ConversationAttachment,
  type ConversationMessage,
} from "@cc/shared/schemas";

import type { OpenCodeSessionMessage } from "../services/opencode-service.js";

type OpenCodePart = OpenCodeSessionMessage["parts"][number];

export function mapRemoteMessage(
  conversationId: string,
  message: OpenCodeSessionMessage,
): ConversationMessage & { createdAtMs: number; updatedAtMs: number } {
  const attachments = extractAttachments(message.parts);
  const parts = message.parts.map(sanitizePart);
  const createdAtMs = message.info.time.created;
  const updatedAtMs = message.info.time.completed ?? createdAtMs;

  return {
    ...conversationMessageSchema.parse({
      id: message.info.id,
      conversationId,
      role: message.info.role,
      content: readContent(message.parts),
      parts,
      attachments,
      createdAt: new Date(createdAtMs).toISOString(),
      updatedAt: new Date(updatedAtMs).toISOString(),
    }),
    createdAtMs,
    updatedAtMs,
  };
}

export function readContent(parts: OpenCodePart[]): string {
  return parts
    .flatMap((part) => {
      const text =
        part.type === "text" && typeof part["text"] === "string" ? part["text"].trim() : "";
      return text ? [text] : [];
    })
    .join("\n\n");
}

export function sanitizePart(part: OpenCodePart) {
  if (part.type === "file") {
    return {
      id: part.id,
      type: part.type,
      mime: typeof part["mime"] === "string" ? part["mime"] : "application/octet-stream",
      filename: typeof part["filename"] === "string" ? part["filename"] : undefined,
      source: isRecord(part["source"]) ? part["source"] : undefined,
    };
  }

  if (part.type === "tool" && isRecord(part["state"])) {
    return {
      ...part,
      state: sanitizeToolState(part["state"]),
    };
  }

  return part;
}

export function sanitizeToolState(state: Record<string, unknown>) {
  if (!Array.isArray(state["attachments"])) {
    return state;
  }

  return {
    ...state,
    attachments: state["attachments"].flatMap((attachment) => {
      if (!isRecord(attachment) || typeof attachment["mime"] !== "string") {
        return [];
      }

      return [
        {
          id: typeof attachment["id"] === "string" ? attachment["id"] : undefined,
          type: "file",
          mime: attachment["mime"],
          filename: typeof attachment["filename"] === "string" ? attachment["filename"] : undefined,
          source: isRecord(attachment["source"]) ? attachment["source"] : undefined,
        },
      ];
    }),
  };
}

export function extractAttachments(parts: OpenCodePart[]): ConversationAttachment[] {
  const map = new Map<string, ConversationAttachment>();

  for (const part of parts) {
    const attachments = readPartAttachments(part);

    for (const attachment of attachments) {
      const key = attachment.id ?? `${attachment.mimeType}:${attachment.filename ?? ""}`;
      map.set(key, attachment);
    }
  }

  return [...map.values()];
}

export function cleanTitle(value: string | null | undefined): string | undefined {
  const title = value?.trim();
  return title ? title : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPartAttachments(part: OpenCodePart): ConversationAttachment[] {
  if (part.type === "file") {
    return [
      conversationAttachmentSchema.parse({
        id: part.id,
        type: inferAttachmentType(part["mime"]),
        filename: typeof part["filename"] === "string" ? part["filename"] : undefined,
        mimeType: typeof part["mime"] === "string" ? part["mime"] : "application/octet-stream",
        source: isRecord(part["source"]) ? part["source"] : undefined,
      }),
    ];
  }

  if (
    part.type !== "tool" ||
    !isRecord(part["state"]) ||
    !Array.isArray(part["state"]["attachments"])
  ) {
    return [];
  }

  return part["state"]["attachments"].flatMap((attachment) => {
    if (!isRecord(attachment) || typeof attachment["mime"] !== "string") {
      return [];
    }

    return [
      conversationAttachmentSchema.parse({
        id: typeof attachment["id"] === "string" ? attachment["id"] : undefined,
        type: inferAttachmentType(attachment["mime"]),
        filename: typeof attachment["filename"] === "string" ? attachment["filename"] : undefined,
        mimeType: attachment["mime"],
        source: isRecord(attachment["source"]) ? attachment["source"] : undefined,
      }),
    ];
  });
}

function inferAttachmentType(mime: unknown): "file" | "image" | "document" {
  if (typeof mime !== "string") {
    return "file";
  }

  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime === "application/pdf" || mime.startsWith("text/")) {
    return "document";
  }

  return "file";
}
