import {
  agentCatalogSchema,
  copyCustomToolToAgentsInputSchema,
  customToolAgentCopyListSchema,
  customToolBulkCopyResultSchema,
  customToolListSchema,
  customToolMutationResultSchema,
  createWorkspaceSkillInputSchema,
  agentListSchema,
  agentSchema,
  chatEventSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSnapshotSchema,
  createAgentInputSchema,
  createCustomToolInputSchema,
  createMcpServerInputSchema,
  engineStatusSchema,
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
  importAgentCustomToolInputSchema,
  liveRequestCancelInputSchema,
  liveRequestResolveInputSchema,
  liveRequestResolveResultSchema,
  mcpAuthRemoveResultSchema,
  mcpAuthStartResultSchema,
  mcpServerListSchema,
  mcpServerSchema,
  opencodeFileListResultSchema,
  opencodeFileSearchResultSchema,
  providerConnectResultSchema,
  providerOauthAuthorizationSchema,
  providerOauthCompleteResultSchema,
  providerStatusListSchema,
  secretMetaListSchema,
  sessionMediaListSchema,
  sendConversationPromptInputSchema,
  setSecretRequestSchema,
  setMcpServerEnabledInputSchema,
  systemUpdateResultSchema,
  systemUpdatePreferencesSchema,
  systemVersionSchema,
  terminalListResponseSchema,
  terminalResizeInputSchema,
  terminalSessionSchema,
  workspaceWatchEventSchema,
  workspaceSkillListSchema,
  workspaceSkillMutationResultSchema,
  workspaceSkillUploadInputSchema,
  type Agent,
  type AgentCatalog,
  type CopyCustomToolToAgentsInput,
  type CreateCustomToolInput,
  type CustomTool,
  type CustomToolAgentCopy,
  type CustomToolMutationResult,
  type CreateWorkspaceSkillInput,
  type ChatEvent,
  type CreateAgentInput,
  type CreateMcpServerInput,
  type ConversationDetail,
  type ConversationSnapshot,
  type ConversationSummary,
  type EngineStatus,
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
  type ImportAgentCustomToolInput,
  type LiveRequestCancelInput,
  type LiveRequestResolveInput,
  type LiveRequestResolveResult,
  type McpAuthRemoveResult,
  type McpAuthStartResult,
  type McpServer,
  type ProviderOauthAuthorization,
  type ProviderOauthCompleteResult,
  type ProviderStatus,
  type SecretMeta,
  type SessionMediaItem,
  type SendConversationPromptInput,
  type SystemUpdateResult,
  type SystemUpdatePreferences,
  type SystemVersion,
  type TerminalCreateInput,
  type TerminalSession,
  type TerminalResizeInput,
  type UpdateAgentInput,
  type UpdateMcpServerInput,
  type UpdateSystemUpdatePreferencesInput,
  type UpdateWorkspaceSkillCategoryInput,
  type WorkspaceWatchEvent,
  type WorkspaceSkill,
  type WorkspaceSkillMutationResult,
  type WorkspaceSkillUploadInput,
  updateAgentInputSchema,
  updateMcpServerInputSchema,
  updateSystemUpdatePreferencesInputSchema,
} from "@cc/shared/schemas";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export async function getEngineStatus(): Promise<EngineStatus> {
  return requestJson<EngineStatus>("/api/opencode", engineStatusSchema);
}

export async function getSystemVersion(): Promise<SystemVersion> {
  return requestJson<SystemVersion>("/api/system/version", systemVersionSchema);
}

export async function updateSystem(): Promise<SystemUpdateResult> {
  return requestJson<SystemUpdateResult>("/api/system/update", systemUpdateResultSchema, {
    method: "POST",
  });
}

export async function getSystemUpdatePreferences(): Promise<SystemUpdatePreferences> {
  return requestJson<SystemUpdatePreferences>(
    "/api/system/update-preferences",
    systemUpdatePreferencesSchema,
  );
}

export async function updateSystemUpdatePreferences(
  input: UpdateSystemUpdatePreferencesInput,
): Promise<SystemUpdatePreferences> {
  return requestJson<SystemUpdatePreferences>(
    "/api/system/update-preferences",
    systemUpdatePreferencesSchema,
    {
      method: "PUT",
      body: updateSystemUpdatePreferencesInputSchema.parse(input),
    },
  );
}

export async function listProviders(): Promise<ProviderStatus[]> {
  return requestJson<ProviderStatus[]>("/api/providers", providerStatusListSchema);
}

export async function listMcpServers(): Promise<McpServer[]> {
  return requestJson<McpServer[]>("/api/mcp-servers", mcpServerListSchema);
}

export async function refreshMcpServers(): Promise<McpServer[]> {
  return requestJson<McpServer[]>("/api/mcp-servers/refresh", mcpServerListSchema, {
    method: "POST",
  });
}

export async function createMcpServer(input: CreateMcpServerInput): Promise<McpServer> {
  return requestJson<McpServer>("/api/mcp-servers", mcpServerSchema, {
    method: "POST",
    body: createMcpServerInputSchema.parse(input),
  });
}

export async function updateMcpServer(id: string, input: UpdateMcpServerInput): Promise<McpServer> {
  return requestJson<McpServer>(`/api/mcp-servers/${encodeURIComponent(id)}`, mcpServerSchema, {
    method: "PATCH",
    body: updateMcpServerInputSchema.parse(input),
  });
}

export async function setMcpServerEnabled(id: string, enabled: boolean): Promise<McpServer> {
  return requestJson<McpServer>(
    `/api/mcp-servers/${encodeURIComponent(id)}/enabled`,
    mcpServerSchema,
    {
      method: "PATCH",
      body: setMcpServerEnabledInputSchema.parse({ enabled }),
    },
  );
}

export async function deleteMcpServer(id: string): Promise<void> {
  const response = await fetch(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function startMcpAuth(id: string): Promise<McpAuthStartResult> {
  return requestJson<McpAuthStartResult>(
    `/api/mcp-servers/${encodeURIComponent(id)}/auth/start`,
    mcpAuthStartResultSchema,
    {
      method: "POST",
    },
  );
}

export async function authenticateMcp(id: string): Promise<McpServer> {
  return requestJson<McpServer>(
    `/api/mcp-servers/${encodeURIComponent(id)}/auth/authenticate`,
    mcpServerSchema,
    {
      method: "POST",
    },
  );
}

export async function completeMcpAuth(id: string, code: string): Promise<McpServer> {
  return requestJson<McpServer>(
    `/api/mcp-servers/${encodeURIComponent(id)}/auth/callback`,
    mcpServerSchema,
    {
      method: "POST",
      body: { code },
    },
  );
}

export async function removeMcpAuth(id: string): Promise<McpAuthRemoveResult> {
  return requestJson<McpAuthRemoveResult>(
    `/api/mcp-servers/${encodeURIComponent(id)}/auth`,
    mcpAuthRemoveResultSchema,
    {
      method: "DELETE",
    },
  );
}

export async function listSecrets(): Promise<SecretMeta[]> {
  return requestJson<SecretMeta[]>("/api/secrets", secretMetaListSchema);
}

export async function setSecret(key: string, value: string): Promise<void> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(setSecretRequestSchema.parse({ value })),
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function deleteSecret(key: string): Promise<void> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(key)}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function resolveLiveRequest(
  conversationId: string,
  requestId: string,
  input: LiveRequestResolveInput,
): Promise<LiveRequestResolveResult> {
  return requestJson<LiveRequestResolveResult>(
    `/api/conversations/${encodeURIComponent(conversationId)}/live-requests/${encodeURIComponent(requestId)}/resolve`,
    liveRequestResolveResultSchema,
    {
      method: "POST",
      body: liveRequestResolveInputSchema.parse(input),
    },
  );
}

export async function cancelLiveRequest(
  conversationId: string,
  requestId: string,
  input: LiveRequestCancelInput = {},
): Promise<LiveRequestResolveResult> {
  return requestJson<LiveRequestResolveResult>(
    `/api/conversations/${encodeURIComponent(conversationId)}/live-requests/${encodeURIComponent(requestId)}/cancel`,
    liveRequestResolveResultSchema,
    {
      method: "POST",
      body: liveRequestCancelInputSchema.parse(input),
    },
  );
}

export async function listAgents(): Promise<Agent[]> {
  return requestJson<Agent[]>("/api/agents", agentListSchema);
}

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

export async function getAgentBySlug(slug: string): Promise<Agent> {
  return requestJson<Agent>(`/api/agents/by-slug/${encodeURIComponent(slug)}`, agentSchema);
}

export async function getAgentCatalog(): Promise<AgentCatalog> {
  return requestJson<AgentCatalog>("/api/agents/catalog", agentCatalogSchema);
}

export async function listCustomTools(): Promise<CustomTool[]> {
  return requestJson<CustomTool[]>("/api/custom-tools", customToolListSchema);
}

export async function listWorkspaceSkills(): Promise<WorkspaceSkill[]> {
  return requestJson<WorkspaceSkill[]>("/api/workspace-skills", workspaceSkillListSchema);
}

export async function createCustomTool(
  input: CreateCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    "/api/custom-tools",
    customToolMutationResultSchema,
    {
      method: "POST",
      body: createCustomToolInputSchema.parse(input),
    },
  );
}

export async function deleteCustomTool(slug: string): Promise<void> {
  const response = await fetch(`/api/custom-tools/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function createWorkspaceSkill(
  input: CreateWorkspaceSkillInput,
): Promise<WorkspaceSkillMutationResult> {
  return requestJson<WorkspaceSkillMutationResult>(
    "/api/workspace-skills",
    workspaceSkillMutationResultSchema,
    {
      method: "POST",
      body: createWorkspaceSkillInputSchema.parse(input),
    },
  );
}

export async function uploadWorkspaceSkill(
  input: WorkspaceSkillUploadInput,
): Promise<WorkspaceSkillMutationResult> {
  const body = workspaceSkillUploadInputSchema.parse(input);
  const response = await fetch("/api/workspace-skills/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (response.status === 400) {
    const details =
      payload && typeof payload === "object" && "error" in payload
        ? (
            payload as {
              error?: {
                details?: { renameSuggestedFrom?: string; renameSuggestedTo?: string };
              };
            }
          ).error?.details
        : undefined;

    if (
      details?.renameSuggestedFrom &&
      details?.renameSuggestedTo &&
      details.renameSuggestedFrom !== details.renameSuggestedTo
    ) {
      throw new WorkspaceSkillUploadRenameError(
        readApiError(payload, response.status, response.statusText),
        details.renameSuggestedFrom,
        details.renameSuggestedTo,
      );
    }
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return workspaceSkillMutationResultSchema.parse(payload);
}

export async function deleteWorkspaceSkill(slug: string): Promise<void> {
  const response = await fetch(`/api/workspace-skills/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function updateWorkspaceSkillCategory(
  slug: string,
  input: UpdateWorkspaceSkillCategoryInput,
): Promise<WorkspaceSkillMutationResult> {
  const response = await fetch(`/api/workspace-skills/${encodeURIComponent(slug)}/category`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return workspaceSkillMutationResultSchema.parse(payload);
}

export async function copyCustomToolToAgents(
  slug: string,
  input: CopyCustomToolToAgentsInput,
): Promise<{ copied: Array<{ agentId: string; agentSlug: string; overwritten: boolean }> }> {
  return requestJson(
    `/api/custom-tools/${encodeURIComponent(slug)}/copy-to-agents`,
    customToolBulkCopyResultSchema,
    {
      method: "POST",
      body: copyCustomToolToAgentsInputSchema.parse(input),
    },
  );
}

export async function listAgentCustomTools(agentId: string): Promise<CustomToolAgentCopy[]> {
  return requestJson<CustomToolAgentCopy[]>(
    `/api/agents/${encodeURIComponent(agentId)}/custom-tools`,
    customToolAgentCopyListSchema,
  );
}

export async function copyAgentCustomToolToGlobal(
  agentId: string,
  slug: string,
  input: ImportAgentCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    `/api/agents/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}/copy-to-global`,
    customToolMutationResultSchema,
    {
      method: "POST",
      body: importAgentCustomToolInputSchema.parse(input),
    },
  );
}

export async function moveAgentCustomToolToGlobal(
  agentId: string,
  slug: string,
  input: ImportAgentCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    `/api/agents/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}/move-to-global`,
    customToolMutationResultSchema,
    {
      method: "POST",
      body: importAgentCustomToolInputSchema.parse(input),
    },
  );
}

export async function deleteAgentCustomTool(agentId: string, slug: string): Promise<void> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  return requestJson<Agent>("/api/agents", agentSchema, {
    method: "POST",
    body: createAgentInputSchema.parse(input),
  });
}

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
  return requestJson<Agent>(`/api/agents/${encodeURIComponent(id)}`, agentSchema, {
    method: "PATCH",
    body: updateAgentInputSchema.parse(input),
  });
}

export async function archiveAgent(id: string): Promise<Agent> {
  return requestJson<Agent>(`/api/agents/${encodeURIComponent(id)}`, agentSchema, {
    method: "DELETE",
  });
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
  const response = await fetch(`/api/file-manager/entries?${params.toString()}`, {
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

export class WorkspaceSkillUploadRenameError extends Error {
  readonly renameSuggestedFrom: string;
  readonly renameSuggestedTo: string;

  constructor(message: string, renameSuggestedFrom: string, renameSuggestedTo: string) {
    super(message);
    this.name = "WorkspaceSkillUploadRenameError";
    this.renameSuggestedFrom = renameSuggestedFrom;
    this.renameSuggestedTo = renameSuggestedTo;
  }
}

export async function saveFileManagerFileContent(
  input: FileManagerSaveFileInput,
): Promise<FileManagerSaveFileResponse> {
  const body = fileManagerSaveFileInputSchema.parse(input);
  const response = await fetch("/api/file-manager/files/content", {
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

export async function submitProviderApiKey(providerId: string, apiKey: string): Promise<boolean> {
  const result = await requestJson<{ success: boolean }>(
    `/api/providers/${encodeURIComponent(providerId)}/api-key`,
    providerConnectResultSchema,
    {
      method: "PUT",
      body: { apiKey },
    },
  );

  return result.success;
}

export async function startProviderOauth(
  providerId: string,
  method: number,
  inputs?: Record<string, string>,
): Promise<ProviderOauthAuthorization> {
  return requestJson<ProviderOauthAuthorization>(
    `/api/providers/${encodeURIComponent(providerId)}/oauth/start`,
    providerOauthAuthorizationSchema,
    {
      method: "POST",
      body: { method, inputs },
    },
  );
}

export async function completeProviderOauth(
  providerId: string,
  method: number,
  code?: string,
): Promise<ProviderOauthCompleteResult> {
  return requestJson<ProviderOauthCompleteResult>(
    `/api/providers/${encodeURIComponent(providerId)}/oauth/complete`,
    providerOauthCompleteResultSchema,
    {
      method: "POST",
      body: { method, code },
    },
  );
}

export async function disconnectProvider(providerId: string): Promise<boolean> {
  const result = await requestJson<{ success: boolean }>(
    `/api/providers/${encodeURIComponent(providerId)}`,
    providerConnectResultSchema,
    {
      method: "DELETE",
    },
  );

  return result.success;
}

async function requestJson<T>(
  url: string,
  schema: { parse(input: unknown): T },
  options?: RequestOptions,
): Promise<T> {
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "content-type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return schema.parse(payload);
}

export function readApiError(payload: unknown, status: number, statusText?: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;

    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }

  return statusText || `Request failed with status ${String(status)}.`;
}

// --- Conversation API ---

export async function getActiveConversation(agentId: string): Promise<ConversationSnapshot> {
  return requestJson<ConversationSnapshot>(
    `/api/agents/${encodeURIComponent(agentId)}/conversations/active`,
    conversationSnapshotSchema,
  );
}

export async function listConversations(agentId: string): Promise<ConversationSummary[]> {
  return requestJson<ConversationSummary[]>(
    `/api/agents/${encodeURIComponent(agentId)}/conversations`,
    conversationListSchema,
  );
}

export async function deleteConversation(agentId: string, conversationId: string): Promise<void> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function getConversation(
  agentId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  return requestJson<ConversationDetail>(
    `/api/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
    conversationDetailSchema,
  );
}

export async function startFreshConversation(agentId: string): Promise<ConversationSnapshot> {
  return requestJson<ConversationSnapshot>(
    `/api/agents/${encodeURIComponent(agentId)}/conversations/start-fresh`,
    conversationSnapshotSchema,
    { method: "POST" },
  );
}

export async function fetchConversationMedia(conversationId: string): Promise<SessionMediaItem[]> {
  return requestJson<SessionMediaItem[]>(
    `/api/conversations/${encodeURIComponent(conversationId)}/media`,
    sessionMediaListSchema,
  );
}

export async function sendPrompt(
  conversationId: string,
  input: SendConversationPromptInput,
): Promise<void> {
  const parsed = sendConversationPromptInputSchema.parse(input);
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/prompt?stream=true`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function abortConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/abort`, {
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function replyPermission(
  conversationId: string,
  requestId: string,
  reply: "once" | "always" | "reject",
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/permissions/${encodeURIComponent(requestId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function replyQuestion(
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function rejectQuestion(conversationId: string, requestId: string): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}/reject`,
    { method: "POST" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function sendShell(conversationId: string, command: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/shell`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function sendCommand(
  conversationId: string,
  command: string,
  args?: string,
): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command, arguments: args ?? "" }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function summarizeConversation(conversationId: string): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/summarize`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function searchAgentWorkspaceFiles(agentId: string, query: string): Promise<string[]> {
  return requestJson<string[]>(
    `/api/agents/${encodeURIComponent(agentId)}/workspace/find/file?query=${encodeURIComponent(query)}`,
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
    `/api/agents/${encodeURIComponent(agentId)}/workspace/file?${qs}`,
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

export async function* connectWorkspaceEvents(
  agentId: string,
  signal: AbortSignal,
): AsyncGenerator<WorkspaceWatchEvent> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/events`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Workspace SSE connection failed with status ${String(response.status)}`);
  }

  yield* parseSse(response, workspaceWatchEventSchema);
}

// --- SSE Event Consumer ---

export async function* connectConversationEvents(
  conversationId: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/events`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed with status ${String(response.status)}`);
  }

  yield* parseSse(response, chatEventSchema);
}

async function* parseSse<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): AsyncGenerator<T> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const block of parts) {
        const dataLines: string[] = [];

        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (dataLines.length === 0) {
          continue;
        }

        try {
          const json = JSON.parse(dataLines.join("\n")) as unknown;
          yield schema.parse(json);
        } catch (err) {
          console.warn("[SSE] Failed to parse event:", dataLines.join("\n"), err);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function createTerminalSession(input: TerminalCreateInput): Promise<TerminalSession> {
  return requestJson<TerminalSession>("/api/terminal", terminalSessionSchema, {
    method: "POST",
    body: input,
  });
}

export async function listTerminalSessions(): Promise<TerminalSession[]> {
  const response = await requestJson<{ sessions: TerminalSession[] }>(
    "/api/terminal",
    terminalListResponseSchema,
  );
  return response.sessions;
}

export async function getTerminalSession(id: string): Promise<TerminalSession> {
  return requestJson<TerminalSession>(`/api/terminal/${id}`, terminalSessionSchema);
}

export async function resizeTerminalSession(id: string, input: TerminalResizeInput): Promise<void> {
  const response = await fetch(`/api/terminal/${id}/resize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(terminalResizeInputSchema.parse(input)),
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function closeTerminalSession(id: string): Promise<void> {
  const response = await fetch(`/api/terminal/${id}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export function connectTerminalWebSocket(id: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/terminal/${id}/connect`);
}
