import { apiFetch, readApiError, requestJson } from "./client";

import {
  MCP_ENGINE_RESTART_REQUIRED_REASON,
  activateMcpServerInputSchema,
  apiErrorResponseSchema,
  createMcpServerInputSchema,
  mcpAuthRemoveResultSchema,
  mcpAuthStartResultSchema,
  mcpServerListSchema,
  mcpServerSchema,
  providerConnectResultSchema,
  providerOauthAuthorizationSchema,
  providerOauthCompleteResultSchema,
  providerStatusListSchema,
  setMcpServerEnabledInputSchema,
  type CreateMcpServerInput,
  type ActivateMcpServerInput,
  type McpAuthRemoveResult,
  type McpAuthStartResult,
  type McpServer,
  type ProviderOauthAuthorization,
  type ProviderOauthCompleteResult,
  type ProviderStatus,
  type UpdateMcpServerInput,
  updateMcpServerInputSchema,
} from "@cc/shared/schemas";

export class McpEngineRestartRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpEngineRestartRequiredError";
  }
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

export async function activateMcpServer(
  id: string,
  input: ActivateMcpServerInput,
): Promise<McpServer> {
  const response = await apiFetch(`/api/mcp-servers/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(activateMcpServerInputSchema.parse(input)),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    const apiError = apiErrorResponseSchema.safeParse(payload);
    if (
      response.status === 409 &&
      apiError.success &&
      readRestartRequiredReason(apiError.data.error.details) === MCP_ENGINE_RESTART_REQUIRED_REASON
    ) {
      throw new McpEngineRestartRequiredError(apiError.data.error.message);
    }

    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return mcpServerSchema.parse(payload);
}

function readRestartRequiredReason(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || !("reason" in details)) {
    return undefined;
  }

  return typeof details.reason === "string" ? details.reason : undefined;
}

export async function deleteMcpServer(id: string): Promise<void> {
  const response = await apiFetch(`/api/mcp-servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

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
