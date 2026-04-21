import {
  agentCatalogSchema,
  agentListSchema,
  agentSchema,
  chatEventSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSnapshotSchema,
  createAgentInputSchema,
  providerConnectResultSchema,
  providerOauthAuthorizationSchema,
  providerOauthCompleteResultSchema,
  providerStatusListSchema,
  sendConversationPromptInputSchema,
  workspaceFileSearchResultSchema,
  type Agent,
  type AgentCatalog,
  type ChatEvent,
  type CreateAgentInput,
  type ConversationDetail,
  type ConversationSnapshot,
  type ConversationSummary,
  type ProviderOauthAuthorization,
  type ProviderOauthCompleteResult,
  type ProviderStatus,
  type SendConversationPromptInput,
  type UpdateAgentInput,
  updateAgentInputSchema,
} from "@cc/shared/schemas";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export async function listProviders(): Promise<ProviderStatus[]> {
  return requestJson<ProviderStatus[]>("/api/providers", providerStatusListSchema);
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
    throw new Error(readApiError(payload, response.status));
  }

  return schema.parse(payload);
}

function readApiError(payload: unknown, status: number): string {
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

  return `Request failed with status ${String(status)}.`;
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
    throw new Error(readApiError(payload, response.status));
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
    throw new Error(readApiError(payload, response.status));
  }
}

export async function abortConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/abort`, {
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status));
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
    throw new Error(readApiError(payload, response.status));
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
    throw new Error(readApiError(payload, response.status));
  }
}

export async function rejectQuestion(conversationId: string, requestId: string): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}/reject`,
    { method: "POST" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status));
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
    throw new Error(readApiError(payload, response.status));
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
    throw new Error(readApiError(payload, response.status));
  }
}

export async function summarizeConversation(conversationId: string): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/summarize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status));
  }
}

export async function searchWorkspaceFiles(agentId: string, query: string): Promise<string[]> {
  const result = await requestJson<{ files: string[] }>(
    `/api/agents/${encodeURIComponent(agentId)}/workspace/files?query=${encodeURIComponent(query)}`,
    workspaceFileSearchResultSchema,
  );
  return result.files;
}

export type FileNode = { name: string; path: string; type: "file" | "directory" };

export async function getWorkspaceTree(agentId: string, path?: string): Promise<FileNode[]> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  const qs = params.toString();
  const url = `/api/agents/${encodeURIComponent(agentId)}/workspace/tree${qs ? `?${qs}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status));
  }

  const json = (await response.json()) as { nodes: FileNode[] };
  return json.nodes;
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
