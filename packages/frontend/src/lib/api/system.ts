import { requestJson } from "./client";

import {
  engineStatusSchema,
  systemUpdateResultSchema,
  systemUpdatePreferencesSchema,
  systemVersionSchema,
  type EngineStatus,
  type SystemUpdateResult,
  type SystemUpdatePreferences,
  type SystemVersion,
  type UpdateSystemUpdatePreferencesInput,
  updateSystemUpdatePreferencesInputSchema,
} from "@cc/shared/schemas";

export async function getEngineStatus(): Promise<EngineStatus> {
  return requestJson<EngineStatus>("/api/opencode", engineStatusSchema);
}

export async function restartEngine(): Promise<EngineStatus> {
  return requestJson<EngineStatus>("/api/opencode/restart", engineStatusSchema, {
    method: "POST",
  });
}

export async function getSystemVersion(): Promise<SystemVersion> {
  return requestJson<SystemVersion>("/api/system/version", systemVersionSchema);
}

export async function checkSystemVersion(): Promise<SystemVersion> {
  return requestJson<SystemVersion>("/api/system/version/check", systemVersionSchema, {
    method: "POST",
  });
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
