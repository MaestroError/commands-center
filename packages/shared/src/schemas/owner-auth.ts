import { z } from "zod";

export const ownerAuthStatusSchema = z.enum([
  "unclaimed",
  "claimed-authenticated",
  "claimed-unauthenticated",
]);

// Password policy is enforced by the backend. This schema only rejects missing fields
// and intentionally preserves whitespace because spaces can be part of the secret.
export const ownerPasswordNonEmptySchema = z.string().min(1);

const ownerClaimCodeInputSchema = z.string().trim().min(1);

export const ownerClaimInputSchema = z.object({
  claimCode: ownerClaimCodeInputSchema,
  password: ownerPasswordNonEmptySchema,
  confirmPassword: ownerPasswordNonEmptySchema,
  rememberBrowser: z.boolean().optional().default(false),
});

export const ownerClaimResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export const ownerAuthStatusResultSchema = z.object({
  status: ownerAuthStatusSchema,
});

export const ownerCsrfRefreshResultSchema = z.object({
  status: z.literal("refreshed"),
});

export const ownerLoginInputSchema = z.object({
  password: ownerPasswordNonEmptySchema,
  rememberBrowser: z.boolean().optional().default(false),
});

export const ownerLoginResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export const ownerPasswordChangeInputSchema = z.object({
  currentPassword: ownerPasswordNonEmptySchema,
  newPassword: ownerPasswordNonEmptySchema,
  confirmNewPassword: ownerPasswordNonEmptySchema,
});

export const ownerPasswordChangeResultSchema = z.object({
  status: z.literal("changed"),
  otherSessionsRevoked: z.literal(true),
});

export const ownerLogoutResultSchema = z.object({
  status: z.literal("claimed-unauthenticated"),
});

export const ownerReclaimInputSchema = z.object({
  claimCode: ownerClaimCodeInputSchema,
  password: ownerPasswordNonEmptySchema,
  confirmPassword: ownerPasswordNonEmptySchema,
  rememberBrowser: z.boolean().optional().default(false),
});

export const ownerReclaimResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export type OwnerAuthStatus = z.infer<typeof ownerAuthStatusSchema>;
export type OwnerAuthStatusResult = z.infer<typeof ownerAuthStatusResultSchema>;
export type OwnerCsrfRefreshResult = z.infer<typeof ownerCsrfRefreshResultSchema>;
export type OwnerClaimInput = z.infer<typeof ownerClaimInputSchema>;
export type OwnerClaimResult = z.infer<typeof ownerClaimResultSchema>;
export type OwnerLoginInput = z.infer<typeof ownerLoginInputSchema>;
export type OwnerLoginResult = z.infer<typeof ownerLoginResultSchema>;
export type OwnerPasswordChangeInput = z.infer<typeof ownerPasswordChangeInputSchema>;
export type OwnerPasswordChangeResult = z.infer<typeof ownerPasswordChangeResultSchema>;
export type OwnerLogoutResult = z.infer<typeof ownerLogoutResultSchema>;
export type OwnerReclaimInput = z.infer<typeof ownerReclaimInputSchema>;
export type OwnerReclaimResult = z.infer<typeof ownerReclaimResultSchema>;
