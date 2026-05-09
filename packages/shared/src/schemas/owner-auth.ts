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
});

export const ownerClaimResultSchema = z.object({
  status: z.literal("claimed-authenticated"),
});

export type OwnerAuthStatus = z.infer<typeof ownerAuthStatusSchema>;
export type OwnerClaimInput = z.infer<typeof ownerClaimInputSchema>;
export type OwnerClaimResult = z.infer<typeof ownerClaimResultSchema>;
