import { z } from "zod";

// Legacy scope enum. Retained ONLY to parse pre-capability tokens' persisted
// `scopes_json` at read time (see api-token-service `mapApiToken`). New tokens
// store `permissions_json` instead; the record below no longer exposes scopes.
export const apiTokenScopeSchema = z.enum(["templates", "tasks"]);

// Per-token permissions. `capabilities` are catalog capability ids (validated
// against API_TOKEN_CAPABILITIES in the service). `templates` is scaffolded here
// and consumed in Phase 3 (per-template MCP tool toggles).
export const apiTokenPermissionsSchema = z.object({
  capabilities: z.array(z.string().min(1)).default([]),
  templates: z.array(z.string().min(1)).default([]),
});

const nonEmptyPermissions = (permissions: {
  capabilities: string[];
  templates: string[];
}): boolean => permissions.capabilities.length > 0 || permissions.templates.length > 0;

export const apiTokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  permissions: apiTokenPermissionsSchema,
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
});

export const apiTokenListResponseSchema = z.object({
  tokens: z.array(apiTokenRecordSchema),
});

export const createApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: apiTokenPermissionsSchema.refine(nonEmptyPermissions, {
    message: "Select at least one permission.",
  }),
});

// In-place permission edit (secret preserved). Name is optionally editable.
export const updateApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  permissions: apiTokenPermissionsSchema.refine(nonEmptyPermissions, {
    message: "Select at least one permission.",
  }),
});

export const createApiTokenResponseSchema = z.object({
  token: z.string(),
  record: apiTokenRecordSchema,
});

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type ApiTokenPermissions = z.infer<typeof apiTokenPermissionsSchema>;
export type ApiTokenRecord = z.infer<typeof apiTokenRecordSchema>;
export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;
export type CreateApiTokenInput = z.infer<typeof createApiTokenInputSchema>;
export type UpdateApiTokenInput = z.infer<typeof updateApiTokenInputSchema>;
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
