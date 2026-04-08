import {
  providerConnectResultSchema,
  providerOauthAuthorizationSchema,
  providerStatusListSchema,
  type ProviderOauthAuthorization,
  type ProviderStatus,
} from "@cc/shared/schemas";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export async function listProviders(): Promise<ProviderStatus[]> {
  return requestJson<ProviderStatus[]>("/api/providers", providerStatusListSchema);
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
): Promise<boolean> {
  const result = await requestJson<{ success: boolean }>(
    `/api/providers/${encodeURIComponent(providerId)}/oauth/complete`,
    providerConnectResultSchema,
    {
      method: "POST",
      body: { method, code },
    },
  );

  return result.success;
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
