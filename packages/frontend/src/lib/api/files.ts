import { apiFetch, readApiError, requestJson } from "./client";

import {
  fileManagerCreateEntryInputSchema,
  fileManagerCreateEntryResponseSchema,
  fileManagerDirectorySearchQuerySchema,
  fileManagerDirectorySearchResponseSchema,
  fileManagerDeleteEntryQuerySchema,
  fileManagerFileContentQuerySchema,
  fileManagerFileContentResponseSchema,
  fileManagerListQuerySchema,
  fileManagerListResponseSchema,
  fileManagerMoveEntryInputSchema,
  fileManagerMoveEntryResponseSchema,
  fileManagerPreferencesSchema,
  fileManagerRenameEntryInputSchema,
  fileManagerRenameEntryResponseSchema,
  fileManagerSaveFileInputSchema,
  fileManagerSaveFileResponseSchema,
  fileManagerUploadInputSchema,
  fileManagerUploadResponseSchema,
  fileManagerUpdatePreferencesInputSchema,
  globalSearchQuerySchema,
  globalSearchWorkspaceFilesResponseSchema,
  opencodeFileListResultSchema,
  opencodeFileSearchResultSchema,
  type FileManagerCreateEntryInput,
  type FileManagerDeleteEntryQuery,
  type FileManagerDirectorySearchQuery,
  type FileManagerDirectorySearchResponse,
  type FileManagerFileContentQuery,
  type FileManagerFileContentResponse,
  type FileManagerFileRevision,
  type FileManagerListQuery,
  type FileManagerListResponse,
  type FileManagerMoveEntryInput,
  type FileManagerMoveEntryResponse,
  type FileManagerPreferences,
  type FileManagerRenameEntryInput,
  type FileManagerSaveFileInput,
  type FileManagerSaveFileResponse,
  type FileManagerUploadInput,
  type FileManagerUploadResponse,
  type FileManagerUpdatePreferencesInput,
  type GlobalSearchWorkspaceFilesResponse,
} from "@cc/shared/schemas";

export async function searchWorkspaceFiles(
  query: string,
): Promise<GlobalSearchWorkspaceFilesResponse> {
  const parsed = globalSearchQuerySchema.parse({ query });
  const params = new URLSearchParams();
  params.set("query", parsed.query);

  return requestJson<GlobalSearchWorkspaceFilesResponse>(
    `/api/search/files?${params.toString()}`,
    globalSearchWorkspaceFilesResponseSchema,
  );
}

export async function listFileManagerNodes(
  query: FileManagerListQuery,
): Promise<FileManagerListResponse> {
  const parsed = fileManagerListQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  if (parsed.path) {
    params.set("path", parsed.path);
  }
  return requestJson<FileManagerListResponse>(
    `/api/file-manager/nodes?${params.toString()}`,
    fileManagerListResponseSchema,
  );
}

export async function createFileManagerEntry(
  input: FileManagerCreateEntryInput,
): Promise<{ path: string }> {
  return requestJson<{ path: string }>(
    "/api/file-manager/entries",
    fileManagerCreateEntryResponseSchema,
    {
      method: "POST",
      body: fileManagerCreateEntryInputSchema.parse(input),
    },
  );
}

export async function renameFileManagerEntry(
  input: FileManagerRenameEntryInput,
): Promise<{ path: string }> {
  return requestJson<{ path: string }>(
    "/api/file-manager/entries",
    fileManagerRenameEntryResponseSchema,
    {
      method: "PATCH",
      body: fileManagerRenameEntryInputSchema.parse(input),
    },
  );
}

export async function deleteFileManagerEntry(query: FileManagerDeleteEntryQuery): Promise<void> {
  const parsed = fileManagerDeleteEntryQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  params.set("path", parsed.path);
  const response = await apiFetch(`/api/file-manager/entries?${params.toString()}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function uploadFileManagerEntries(
  input: FileManagerUploadInput,
): Promise<FileManagerUploadResponse> {
  return requestJson<FileManagerUploadResponse>(
    "/api/file-manager/uploads",
    fileManagerUploadResponseSchema,
    {
      method: "POST",
      body: fileManagerUploadInputSchema.parse(input),
    },
  );
}

export function buildFileManagerDownloadHref(query: FileManagerFileContentQuery): string {
  const parsed = fileManagerFileContentQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  params.set("path", parsed.path);
  return `/api/file-manager/files/download?${params.toString()}`;
}

export function downloadFileManagerFile(
  query: FileManagerFileContentQuery,
  filename: string,
): void {
  triggerAnchorDownload(buildFileManagerDownloadHref(query), filename);
}

export function buildFileManagerZipDownloadHref(query: FileManagerFileContentQuery): string {
  const parsed = fileManagerFileContentQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  params.set("path", parsed.path);
  return `/api/file-manager/files/download-zip?${params.toString()}`;
}

export function downloadFileManagerFolderZip(
  query: FileManagerFileContentQuery,
  folderName: string,
): void {
  triggerAnchorDownload(buildFileManagerZipDownloadHref(query), `${folderName}.zip`);
}

function triggerAnchorDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function getFileManagerFileContent(
  query: FileManagerFileContentQuery,
): Promise<FileManagerFileContentResponse> {
  const parsed = fileManagerFileContentQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  params.set("path", parsed.path);
  return requestJson<FileManagerFileContentResponse>(
    `/api/file-manager/files/content?${params.toString()}`,
    fileManagerFileContentResponseSchema,
  );
}

export class FileSaveConflictError extends Error {
  readonly currentRevision?: FileManagerFileRevision;
  constructor(message: string, currentRevision?: FileManagerFileRevision) {
    super(message);
    this.name = "FileSaveConflictError";
    this.currentRevision = currentRevision;
  }
}

export async function saveFileManagerFileContent(
  input: FileManagerSaveFileInput,
): Promise<FileManagerSaveFileResponse> {
  const body = fileManagerSaveFileInputSchema.parse(input);
  const response = await apiFetch("/api/file-manager/files/content", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (response.status === 409) {
    const message = readApiError(payload, response.status, response.statusText);
    const details =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { details?: { currentRevision?: FileManagerFileRevision } } }).error
            ?.details?.currentRevision
        : undefined;
    throw new FileSaveConflictError(message, details);
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return fileManagerSaveFileResponseSchema.parse(payload);
}

export async function getFileManagerPreferences(): Promise<FileManagerPreferences> {
  return requestJson<FileManagerPreferences>(
    "/api/file-manager/preferences",
    fileManagerPreferencesSchema,
  );
}

export async function updateFileManagerPreferences(
  input: FileManagerUpdatePreferencesInput,
): Promise<FileManagerPreferences> {
  return requestJson<FileManagerPreferences>(
    "/api/file-manager/preferences",
    fileManagerPreferencesSchema,
    {
      method: "PUT",
      body: fileManagerUpdatePreferencesInputSchema.parse(input),
    },
  );
}

export async function searchAgentWorkspaceFiles(agentId: string, query: string): Promise<string[]> {
  return requestJson<string[]>(
    `/api/specialists/${encodeURIComponent(agentId)}/workspace/find/file?query=${encodeURIComponent(query)}`,
    opencodeFileSearchResultSchema,
  );
}

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  isCritical?: boolean;
  criticalReason?: string;
};

export async function getWorkspaceTree(agentId: string, path?: string): Promise<FileNode[]> {
  const params = new URLSearchParams();
  params.set("path", path ?? ".");
  const qs = params.toString();
  const nodes = await requestJson(
    `/api/specialists/${encodeURIComponent(agentId)}/workspace/file?${qs}`,
    opencodeFileListResultSchema,
  );

  return nodes
    .filter((node) => !node.ignored)
    .map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      isCritical: node.isCritical,
      criticalReason: node.criticalReason,
    }));
}

export async function moveFileManagerEntry(
  input: FileManagerMoveEntryInput,
): Promise<FileManagerMoveEntryResponse> {
  return requestJson<FileManagerMoveEntryResponse>(
    "/api/file-manager/entries/move",
    fileManagerMoveEntryResponseSchema,
    {
      method: "POST",
      body: fileManagerMoveEntryInputSchema.parse(input),
    },
  );
}

export async function searchFileManagerDirectories(
  query: FileManagerDirectorySearchQuery,
): Promise<FileManagerDirectorySearchResponse> {
  const parsed = fileManagerDirectorySearchQuerySchema.parse(query);
  const params = new URLSearchParams();
  params.set("root", parsed.root);
  if (parsed.query && parsed.query.length > 0) {
    params.set("query", parsed.query);
  }
  if (parsed.excludePath && parsed.excludePath.length > 0) {
    params.set("excludePath", parsed.excludePath);
  }
  if (parsed.limit !== undefined) {
    params.set("limit", String(parsed.limit));
  }

  return requestJson<FileManagerDirectorySearchResponse>(
    `/api/file-manager/directories?${params.toString()}`,
    fileManagerDirectorySearchResponseSchema,
  );
}
