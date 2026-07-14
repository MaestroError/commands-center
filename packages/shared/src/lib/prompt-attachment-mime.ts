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

export function resolvePromptAttachmentMimeType(
  filename: string | undefined,
  providedMimeType: string,
): string {
  const extension = filename?.split(".").at(-1)?.toLowerCase();

  if (extension && TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
    return "text/plain";
  }

  if (providedMimeType.trim().length > 0) {
    return providedMimeType;
  }

  if (!extension) {
    return "application/octet-stream";
  }

  return KNOWN_EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream";
}
