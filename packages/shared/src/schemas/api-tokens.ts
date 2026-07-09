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

// --- Per-token execution audit (Phase 5) -----------------------------------

export const apiTokenActivitySurfaceSchema = z.enum(["rest", "mcp"]);
export const apiTokenActivityOutcomeSchema = z.enum(["ok", "error"]);

export const apiTokenActivityEntrySchema = z.object({
  id: z.string(),
  tokenId: z.string(),
  // Snapshot of the token name at request time (survives rename/revoke).
  tokenName: z.string(),
  surface: apiTokenActivitySurfaceSchema,
  // REST: "GET /api/public/v1/tasks/:id"; MCP: the tool name.
  action: z.string(),
  capabilityId: z.string().nullable(),
  targetKind: z.string().nullable(),
  targetId: z.string().nullable(),
  // Redacted + size-capped summary of what was sent (never raw file bytes).
  inputSummary: z.unknown().optional(),
  outcome: apiTokenActivityOutcomeSchema,
  statusCode: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number(),
});

export const apiTokenActivityListResponseSchema = z.object({
  entries: z.array(apiTokenActivityEntrySchema),
  nextCursor: z.string().nullable(),
});

export const apiTokenAuditSettingsSchema = z.object({
  retentionWeeks: z.number().int().min(1).max(20).default(4),
});

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type ApiTokenActivitySurface = z.infer<typeof apiTokenActivitySurfaceSchema>;
export type ApiTokenActivityOutcome = z.infer<typeof apiTokenActivityOutcomeSchema>;
export type ApiTokenActivityEntry = z.infer<typeof apiTokenActivityEntrySchema>;
export type ApiTokenActivityListResponse = z.infer<typeof apiTokenActivityListResponseSchema>;
export type ApiTokenAuditSettings = z.infer<typeof apiTokenAuditSettingsSchema>;
export type ApiTokenPermissions = z.infer<typeof apiTokenPermissionsSchema>;
export type ApiTokenRecord = z.infer<typeof apiTokenRecordSchema>;
export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;
export type CreateApiTokenInput = z.infer<typeof createApiTokenInputSchema>;
export type UpdateApiTokenInput = z.infer<typeof updateApiTokenInputSchema>;
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
