import type { ConversationAttachment, ConversationPart } from "@cc/shared/schemas";

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "csv",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const KNOWN_EXTENSION_MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};

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

export function resolveAttachmentMimeType(file: File): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase();

  if (extension && TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
    return "text/plain";
  }

  if (file.type.trim().length > 0) {
    return file.type;
  }

  if (!extension) {
    return "application/octet-stream";
  }

  return KNOWN_EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream";
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
