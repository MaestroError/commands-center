import type { ConversationAttachment, ConversationPart } from "@cc/shared/schemas";

export function getMessageAttachments(
  messageAttachments: ConversationAttachment[],
  parts: ConversationPart[],
): ConversationAttachment[] {
  if (messageAttachments.length > 0) {
    return messageAttachments;
  }

  const attachments = new Map<string, ConversationAttachment>();

  for (const part of parts) {
    if (part.type === "file") {
      const mimeType = typeof part["mime"] === "string" ? part["mime"] : "application/octet-stream";
      const filename = typeof part["filename"] === "string" ? part["filename"] : undefined;
      const nextAttachment: ConversationAttachment = {
        id: part.id,
        type: inferAttachmentType(mimeType),
        filename,
        mimeType,
      };
      attachments.set(nextAttachment.id ?? `${mimeType}:${filename ?? ""}`, nextAttachment);
    }
  }

  return [...attachments.values()];
}

function inferAttachmentType(mimeType: string): "file" | "image" | "document" {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
    return "document";
  }

  return "file";
}
