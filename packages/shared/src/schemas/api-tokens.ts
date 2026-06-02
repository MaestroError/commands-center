import { z } from "zod";

export const apiTokenScopeSchema = z.enum(["templates", "tasks"]);

export const apiTokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(apiTokenScopeSchema),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
});

export const apiTokenListResponseSchema = z.object({
  tokens: z.array(apiTokenRecordSchema),
});

export const createApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(apiTokenScopeSchema).min(1),
});

export const createApiTokenResponseSchema = z.object({
  token: z.string(),
  record: apiTokenRecordSchema,
});

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type ApiTokenRecord = z.infer<typeof apiTokenRecordSchema>;
export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;
export type CreateApiTokenInput = z.infer<typeof createApiTokenInputSchema>;
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
