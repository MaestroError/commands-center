import { z } from "zod";

export const secretKeySchema = z.string().trim().min(1);

export const secretMetaSchema = z.object({
  key: secretKeySchema,
  isSet: z.boolean(),
  stale: z.boolean().default(false),
  updatedAt: z.string().datetime(),
});

export const secretMetaListSchema = z.array(secretMetaSchema);

export const setSecretRequestSchema = z.object({
  value: z.string(),
  restart: z.boolean().default(true),
});

export type SecretMeta = z.infer<typeof secretMetaSchema>;
export type SetSecretRequest = z.infer<typeof setSecretRequestSchema>;
