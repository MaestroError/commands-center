import { apiFetch, readApiError, requestJson } from "./client";

import {
  activityListResponseSchema,
  activitySchema,
  archiveAllActivitiesResponseSchema,
  type Activity,
  type ActivityListResponse,
  type ArchiveAllActivitiesResponse,
  apiTokenActivityListResponseSchema,
  apiTokenAuditSettingsSchema,
  apiTokenListResponseSchema,
  apiTokenRecordSchema,
  systemPromptBodySchema,
  systemPromptDetailSchema,
  systemPromptListResponseSchema,
  createApiTokenInputSchema,
  createApiTokenResponseSchema,
  updateApiTokenInputSchema,
  liveRequestCancelInputSchema,
  liveRequestResolveInputSchema,
  liveRequestResolveResultSchema,
  secretMetaListSchema,
  setSecretRequestSchema,
  artifactSharingPreferencesSchema,
  publicMcpSettingsSchema,
  taskRunMonitorSettingsSchema,
  updateArtifactSharingPreferencesInputSchema,
  type ApiTokenActivityListResponse,
  type ApiTokenAuditSettings,
  type ApiTokenListResponse,
  type ApiTokenPermissions,
  type ApiTokenRecord,
  type CreateApiTokenResponse,
  type PublicMcpSettings,
  type SystemPromptDetail,
  type SystemPromptListResponse,
  type LiveRequestCancelInput,
  type LiveRequestResolveInput,
  type LiveRequestResolveResult,
  type SecretMeta,
  type ArtifactSharingPreferences,
  type TaskRunMonitorSettings,
  type UpdateArtifactSharingPreferencesInput,
} from "@cc/shared/schemas";

export async function getTaskArtifactSharingPreferences(): Promise<ArtifactSharingPreferences> {
  return requestJson<ArtifactSharingPreferences>(
    "/api/tasks/artifact-sharing/preferences",
    artifactSharingPreferencesSchema,
  );
}

export async function updateTaskArtifactSharingPreferences(
  input: UpdateArtifactSharingPreferencesInput,
): Promise<ArtifactSharingPreferences> {
  return requestJson<ArtifactSharingPreferences>(
    "/api/tasks/artifact-sharing/preferences",
    artifactSharingPreferencesSchema,
    {
      method: "PUT",
      body: updateArtifactSharingPreferencesInputSchema.parse(input),
    },
  );
}

export async function getTaskRunMonitorSettings(): Promise<TaskRunMonitorSettings> {
  return requestJson<TaskRunMonitorSettings>(
    "/api/task-run-monitor/settings",
    taskRunMonitorSettingsSchema,
  );
}

export async function getPublicMcpSettings(): Promise<PublicMcpSettings> {
  return requestJson<PublicMcpSettings>("/api/public-mcp/settings", publicMcpSettingsSchema);
}

export async function updatePublicMcpSettings(
  input: PublicMcpSettings,
): Promise<PublicMcpSettings> {
  return requestJson<PublicMcpSettings>("/api/public-mcp/settings", publicMcpSettingsSchema, {
    method: "PUT",
    body: publicMcpSettingsSchema.parse(input),
  });
}

export async function updateTaskRunMonitorSettings(
  input: TaskRunMonitorSettings,
): Promise<TaskRunMonitorSettings> {
  return requestJson<TaskRunMonitorSettings>(
    "/api/task-run-monitor/settings",
    taskRunMonitorSettingsSchema,
    {
      method: "PUT",
      body: taskRunMonitorSettingsSchema.parse(input),
    },
  );
}

export async function listSecrets(): Promise<SecretMeta[]> {
  return requestJson<SecretMeta[]>("/api/secrets", secretMetaListSchema);
}

export async function listApiTokens(): Promise<ApiTokenListResponse> {
  return requestJson<ApiTokenListResponse>("/api/api-tokens", apiTokenListResponseSchema);
}

export async function createApiToken(input: {
  name: string;
  permissions: ApiTokenPermissions;
}): Promise<CreateApiTokenResponse> {
  return requestJson<CreateApiTokenResponse>("/api/api-tokens", createApiTokenResponseSchema, {
    method: "POST",
    body: createApiTokenInputSchema.parse(input),
  });
}

export async function updateApiToken(
  id: string,
  input: { name?: string; permissions: ApiTokenPermissions },
): Promise<ApiTokenRecord> {
  return requestJson<ApiTokenRecord>(
    `/api/api-tokens/${encodeURIComponent(id)}`,
    apiTokenRecordSchema,
    {
      method: "PUT",
      body: updateApiTokenInputSchema.parse(input),
    },
  );
}

export async function getTokenActivity(
  id: string,
  query: { limit?: number; cursor?: string } = {},
): Promise<ApiTokenActivityListResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<ApiTokenActivityListResponse>(
    `/api/api-tokens/${encodeURIComponent(id)}/activity${suffix}`,
    apiTokenActivityListResponseSchema,
  );
}

export async function getTokenAuditSettings(): Promise<ApiTokenAuditSettings> {
  return requestJson<ApiTokenAuditSettings>(
    "/api/api-tokens/audit-settings",
    apiTokenAuditSettingsSchema,
  );
}

export async function updateTokenAuditSettings(
  input: ApiTokenAuditSettings,
): Promise<ApiTokenAuditSettings> {
  return requestJson<ApiTokenAuditSettings>(
    "/api/api-tokens/audit-settings",
    apiTokenAuditSettingsSchema,
    { method: "PUT", body: apiTokenAuditSettingsSchema.parse(input) },
  );
}

export async function revokeApiToken(id: string): Promise<void> {
  const response = await apiFetch(`/api/api-tokens/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function setSecret(key: string, value: string, restart = true): Promise<void> {
  const response = await apiFetch(`/api/secrets/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(setSecretRequestSchema.parse({ value, restart })),
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function deleteSecret(key: string, restart = true): Promise<void> {
  const query = restart ? "" : "?restart=false";
  const response = await apiFetch(`/api/secrets/${encodeURIComponent(key)}${query}`, {
    method: "DELETE",
  });

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

export async function getActivities(
  status?: "pending" | "archived" | "all",
): Promise<ActivityListResponse> {
  const query = status ? `?status=${status}` : "";
  return requestJson<ActivityListResponse>(`/api/activities${query}`, activityListResponseSchema);
}

export async function archiveActivity(id: string): Promise<Activity> {
  return requestJson<Activity>(
    `/api/activities/${encodeURIComponent(id)}/archive`,
    activitySchema,
    { method: "POST" },
  );
}

export async function archiveAllActivities(): Promise<ArchiveAllActivitiesResponse> {
  return requestJson<ArchiveAllActivitiesResponse>(
    "/api/activities/archive-all",
    archiveAllActivitiesResponseSchema,
    { method: "POST" },
  );
}

export async function fillSecret(id: string, value: string): Promise<Activity> {
  return requestJson<Activity>(
    `/api/activities/${encodeURIComponent(id)}/fill-secret`,
    activitySchema,
    { method: "POST", body: { value } },
  );
}

export async function getSystemPrompts(): Promise<SystemPromptListResponse> {
  return requestJson<SystemPromptListResponse>(
    "/api/system-prompts",
    systemPromptListResponseSchema,
  );
}

export async function getSystemPrompt(id: string): Promise<SystemPromptDetail> {
  return requestJson<SystemPromptDetail>(
    `/api/system-prompts/${encodeURIComponent(id)}`,
    systemPromptDetailSchema,
  );
}

export async function saveSystemPrompt(id: string, body: string): Promise<SystemPromptDetail> {
  return requestJson<SystemPromptDetail>(
    `/api/system-prompts/${encodeURIComponent(id)}`,
    systemPromptDetailSchema,
    { method: "PUT", body: systemPromptBodySchema.parse({ body }) },
  );
}

export async function resetSystemPrompt(id: string): Promise<SystemPromptDetail> {
  return requestJson<SystemPromptDetail>(
    `/api/system-prompts/${encodeURIComponent(id)}`,
    systemPromptDetailSchema,
    { method: "DELETE" },
  );
}
