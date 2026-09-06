import { ApiRequestError, apiFetch, parseSse, readApiError, requestJson } from "./client";

import {
  chatEventSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationMessagePageSchema,
  conversationMessagePartsSchema,
  conversationSnapshotSchema,
  usageTotalsSchema,
  pendingInteractionsSchema,
  resolvedSystemPromptSchema,
  sessionMediaListSchema,
  sendConversationPromptInputSchema,
  workspaceWatchEventSchema,
  type ChatEvent,
  type ConversationDetail,
  type ConversationMessagePage,
  type ConversationMessageParts,
  type ConversationSnapshot,
  type UsageTotals,
  type ConversationSummary,
  type PendingInteractions,
  type ResolvedSystemPrompt,
  type SessionMediaItem,
  type SendConversationPromptInput,
  type WorkspaceWatchEvent,
} from "@cc/shared/schemas";

export async function getActiveConversation(agentId: string): Promise<ConversationSnapshot> {
  return requestJson<ConversationSnapshot>(
    `/api/specialists/${encodeURIComponent(agentId)}/conversations/active`,
    conversationSnapshotSchema,
  );
}

export async function listConversations(agentId: string): Promise<ConversationSummary[]> {
  return requestJson<ConversationSummary[]>(
    `/api/specialists/${encodeURIComponent(agentId)}/conversations`,
    conversationListSchema,
  );
}

export async function deleteConversation(agentId: string, conversationId: string): Promise<void> {
  const response = await apiFetch(
    `/api/specialists/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
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
    `/api/specialists/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
    conversationDetailSchema,
  );
}

/** One page of older messages, oldest-first. */
export async function getOlderMessages(
  conversationId: string,
  beforeMessageId: string,
  limit?: number,
): Promise<ConversationMessagePage> {
  const query = new URLSearchParams({ before: beforeMessageId });
  if (limit !== undefined) query.set("limit", String(limit));

  return requestJson<ConversationMessagePage>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`,
    conversationMessagePageSchema,
  );
}

/** Token and cost totals for the whole conversation, not just the loaded page. */
export async function getConversationUsage(conversationId: string): Promise<UsageTotals> {
  return requestJson<UsageTotals>(
    `/api/conversations/${encodeURIComponent(conversationId)}/usage`,
    usageTotalsSchema,
  );
}

/** Full parts for one message, replacing the truncated ones from the list payload. */
export async function getMessageParts(
  conversationId: string,
  messageId: string,
): Promise<ConversationMessageParts> {
  return requestJson<ConversationMessageParts>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/parts`,
    conversationMessagePartsSchema,
  );
}

export async function getConversationSystemPrompts(
  conversationId: string,
): Promise<ResolvedSystemPrompt[]> {
  return requestJson<ResolvedSystemPrompt[]>(
    `/api/conversations/${encodeURIComponent(conversationId)}/system-prompts`,
    resolvedSystemPromptSchema.array(),
  );
}

export async function setConversationSystemPromptEnabled(
  conversationId: string,
  promptId: string,
  enabled: boolean,
): Promise<ResolvedSystemPrompt[]> {
  return requestJson<ResolvedSystemPrompt[]>(
    `/api/conversations/${encodeURIComponent(conversationId)}/system-prompts/${encodeURIComponent(promptId)}`,
    resolvedSystemPromptSchema.array(),
    { method: "PATCH", body: { enabled } },
  );
}

export async function startFreshConversation(agentId: string): Promise<ConversationSnapshot> {
  return requestJson<ConversationSnapshot>(
    `/api/specialists/${encodeURIComponent(agentId)}/conversations/start-fresh`,
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

// Rehydrates whatever is currently blocking the conversation on the user
// (pending permissions, an unanswered question, open live requests) straight
// from the backend, rather than relying solely on the SSE stream — which
// drops events fired while nothing was subscribed (e.g. the user navigated
// away from the chat, or reloaded the page).
export async function getPendingInteractions(conversationId: string): Promise<PendingInteractions> {
  return requestJson<PendingInteractions>(
    `/api/conversations/${encodeURIComponent(conversationId)}/pending-interactions`,
    pendingInteractionsSchema,
  );
}

export async function sendPrompt(
  conversationId: string,
  input: SendConversationPromptInput,
): Promise<void> {
  const parsed = sendConversationPromptInputSchema.parse(input);
  const response = await apiFetch(
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
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/abort`,
    {
      method: "POST",
    },
  );

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
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/permissions/${encodeURIComponent(requestId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new ApiRequestError(
      readApiError(payload, response.status, response.statusText),
      response.status,
    );
  }
}

export async function replyQuestion(
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<void> {
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new ApiRequestError(
      readApiError(payload, response.status, response.statusText),
      response.status,
    );
  }
}

export async function rejectQuestion(conversationId: string, requestId: string): Promise<void> {
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}/reject`,
    { method: "POST" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new ApiRequestError(
      readApiError(payload, response.status, response.statusText),
      response.status,
    );
  }
}

export async function sendShell(conversationId: string, command: string): Promise<void> {
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/shell`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
    },
  );

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
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/command`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, arguments: args ?? "" }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function summarizeConversation(conversationId: string): Promise<void> {
  const response = await apiFetch(
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

export async function* connectWorkspaceEvents(
  agentId: string,
  signal: AbortSignal,
): AsyncGenerator<WorkspaceWatchEvent> {
  const response = await apiFetch(
    `/api/specialists/${encodeURIComponent(agentId)}/workspace/events`,
    {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal,
    },
  );

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
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/events`,
    {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`SSE connection failed with status ${String(response.status)}`);
  }

  yield* parseSse(response, chatEventSchema);
}
