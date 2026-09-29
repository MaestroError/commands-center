/**
 * File formats the task context surface (REST, public API, MCP template tools)
 * may write into the workspace. The extension is the contract: the server
 * derives the stored media type from it and verifies the decoded bytes against
 * it, so a caller cannot disguise one format as another.
 *
 * Kept in `shared` so the API docs and MCP tool descriptions advertise exactly
 * what the storage layer enforces.
 */
export const TASK_CONTEXT_ATTACHMENT_EXTENSIONS = [
  ".csv",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".log",
  ".markdown",
  ".md",
  ".mdx",
  ".pdf",
  ".png",
  ".rst",
  ".tsv",
  ".txt",
  ".webp",
  ".xml",
  ".yaml",
  ".yml",
] as const;

export type TaskContextAttachmentExtension = (typeof TASK_CONTEXT_ATTACHMENT_EXTENSIONS)[number];

export const TASK_CONTEXT_ATTACHMENT_EXTENSIONS_LABEL =
  TASK_CONTEXT_ATTACHMENT_EXTENSIONS.join(", ");
