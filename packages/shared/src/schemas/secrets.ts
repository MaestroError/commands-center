import { z } from "zod";

export const secretKeySchema = z.string().trim().min(1);

export const secretMetaSchema = z.object({
  key: secretKeySchema,
  isSet: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const secretMetaListSchema = z.array(secretMetaSchema);

export const setSecretRequestSchema = z.object({
  value: z.string(),
});

export type SecretMeta = z.infer<typeof secretMetaSchema>;
export type SetSecretRequest = z.infer<typeof setSecretRequestSchema>;
