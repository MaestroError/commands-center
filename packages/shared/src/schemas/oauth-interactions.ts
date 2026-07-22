import { z } from "zod";

export const oauthInteractionUidSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const oauthInteractionParamsSchema = z.object({
  uid: oauthInteractionUidSchema,
});

export const oauthInteractionDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("approve"),
      apiToken: z.string().trim().min(1).max(512),
    })
    .strict(),
  z.object({ decision: z.literal("deny") }).strict(),
]);

export const oauthInteractionDetailSchema = z
  .object({
    client: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .strict(),
    redirectUri: z.string(),
    requestedResource: z.string(),
    scopes: z.array(z.string()),
    uid: oauthInteractionUidSchema,
  })
  .strict();

export const oauthInteractionResultSchema = z.object({
  redirectTo: z.string().min(1),
});

export const oauthRuntimeResetResultSchema = z.object({
  status: z.literal("reset"),
});

export type OAuthInteractionDecision = z.infer<typeof oauthInteractionDecisionSchema>;
export type OAuthInteractionDetail = z.infer<typeof oauthInteractionDetailSchema>;
export type OAuthInteractionResult = z.infer<typeof oauthInteractionResultSchema>;
export type OAuthRuntimeResetResult = z.infer<typeof oauthRuntimeResetResultSchema>;
