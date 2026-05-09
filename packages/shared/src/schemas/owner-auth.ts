import { z } from "zod";

export const ownerAuthStatusSchema = z.enum([
  "unclaimed",
  "claimed-authenticated",
  "claimed-unauthenticated",
]);

export const ownerPasswordInputSchema = z.string().min(1);

export const ownerClaimInputSchema = z.object({
  claimCode: z.string().trim().min(1),
  password: ownerPasswordInputSchema,
  confirmPassword: ownerPasswordInputSchema,
  rememberBrowser: z.boolean().optional().default(false),
});

export const ownerClaimResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export const ownerAuthStatusResultSchema = z.object({
  status: ownerAuthStatusSchema,
});

export const ownerLoginInputSchema = z.object({
  password: ownerPasswordInputSchema,
  rememberBrowser: z.boolean().optional().default(false),
});

export const ownerLoginResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export const ownerLogoutResultSchema = z.object({
  status: z.literal("claimed-unauthenticated"),
});

export const ownerReclaimInputSchema = ownerClaimInputSchema;

export const ownerReclaimResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export type OwnerAuthStatus = z.infer<typeof ownerAuthStatusSchema>;
export type OwnerAuthStatusResult = z.infer<typeof ownerAuthStatusResultSchema>;
export type OwnerClaimInput = z.infer<typeof ownerClaimInputSchema>;
export type OwnerClaimResult = z.infer<typeof ownerClaimResultSchema>;
export type OwnerLoginInput = z.infer<typeof ownerLoginInputSchema>;
export type OwnerLoginResult = z.infer<typeof ownerLoginResultSchema>;
export type OwnerLogoutResult = z.infer<typeof ownerLogoutResultSchema>;
export type OwnerReclaimInput = z.infer<typeof ownerReclaimInputSchema>;
export type OwnerReclaimResult = z.infer<typeof ownerReclaimResultSchema>;
