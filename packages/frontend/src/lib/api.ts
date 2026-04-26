import {
  agentCatalogSchema,
  agentListSchema,
  agentSchema,
  chatEventSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSnapshotSchema,
  createAgentInputSchema,
  createMcpServerInputSchema,
  engineStatusSchema,
  fileManagerCreateEntryInputSchema,
  fileManagerCreateEntryResponseSchema,
  fileManagerDeleteEntryQuerySchema,
  fileManagerFileContentQuerySchema,
  fileManagerFileContentResponseSchema,
  fileManagerListQuerySchema,
  fileManagerListResponseSchema,
  fileManagerPreferencesSchema,
  fileManagerRenameEntryInputSchema,
  fileManagerRenameEntryResponseSchema,
  fileManagerSaveFileInputSchema,
  fileManagerSaveFileResponseSchema,
  fileManagerUpdatePreferencesInputSchema,
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
  type Agent,
  type AgentCatalog,
  type ChatEvent,
  type CreateAgentInput,
  type CreateMcpServerInput,
  type ConversationDetail,
  type ConversationSnapshot,
  type ConversationSummary,
  type EngineStatus,
  type FileManagerCreateEntryInput,
  type FileManagerDeleteEntryQuery,
  type FileManagerFileContentQuery,
  type FileManagerFileContentResponse,
  type FileManagerFileRevision,
  type FileManagerListQuery,
  type FileManagerListResponse,
  type FileManagerPreferences,
  type FileManagerRenameEntryInput,
  type FileManagerSaveFileInput,
  type FileManagerSaveFileResponse,
  type FileManagerUpdatePreferencesInput,
  type McpAuthRemoveResult,
  type McpAuthStartResult,
  type McpServer,
  type ProviderOauthAuthorization,
  type ProviderOauthCompleteResult,
  type ProviderStatus,
  type SecretMeta,
  type SessionMediaItem,
  type SendConversationPromptInput,
  type UpdateAgentInput,
  type UpdateMcpServerInput,
  updateAgentInputSchema,
  updateMcpServerInputSchema,
} from "@cc/shared/schemas";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export async function getEngineStatus(): Promise<EngineStatus> {
  return requestJson<EngineStatus>("/api/opencode", engineStatusSchema);
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

export async function listAgents(): Promise<Agent[]> {
  return requestJson<Agent[]>("/api/agents", agentListSchema);
}

export async function getAgentBySlug(slug: string): Promise<Agent> {
  return requestJson<Agent>(`/api/agents/by-slug/${encodeURIComponent(slug)}`, agentSchema);
}

export async function getAgentCatalog(): Promise<AgentCatalog> {
  return requestJson<AgentCatalog>("/api/agents/catalog", agentCatalogSchema);
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

export async function searchWorkspaceFiles(agentId: string, query: string): Promise<string[]> {
  return requestJson<string[]>(
    `/api/agents/${encodeURIComponent(agentId)}/workspace/find/file?query=${encodeURIComponent(query)}`,
    opencodeFileSearchResultSchema,
  );
}

export type FileNode = { name: string; path: string; type: "file" | "directory" };

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
    .map((node) => ({ name: node.name, path: node.path, type: node.type }));
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
          const event = chatEventSchema.parse(json);
          yield event;
        } catch (err) {
          console.warn("[SSE] Failed to parse event:", dataLines.join("\n"), err);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
