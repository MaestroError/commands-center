import { z } from "zod";

export const providerModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerId: z.string().min(1),
});

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(["env", "config", "custom", "api"]),
  env: z.array(z.string().min(1)).default([]),
  models: z.record(z.string(), z.unknown()),
});

export const providerAuthPromptSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    key: z.string().min(1),
    message: z.string().min(1),
    placeholder: z.string().optional(),
    when: z
      .object({
        key: z.string().min(1),
        op: z.enum(["eq", "neq"]),
        value: z.string().min(1),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("select"),
    key: z.string().min(1),
    message: z.string().min(1),
    options: z.array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        hint: z.string().optional(),
      }),
    ),
    when: z
      .object({
        key: z.string().min(1),
        op: z.enum(["eq", "neq"]),
        value: z.string().min(1),
      })
      .optional(),
  }),
]);

export const providerAuthMethodSchema = z.object({
  type: z.enum(["oauth", "api"]),
  label: z.string().min(1),
  prompts: z.array(providerAuthPromptSchema).optional(),
});

export const providerAuthMethodsSchema = z.record(z.string(), z.array(providerAuthMethodSchema));

export const providerOauthAuthorizationSchema = z.object({
  url: z.string().url(),
  method: z.enum(["auto", "code"]),
  instructions: z.string(),
});

export const providerListSchema = z.object({
  all: z.array(providerSchema),
  default: z.record(z.string(), z.string()),
  connected: z.array(z.string().min(1)),
});

export const configProvidersSchema = z.object({
  providers: z.array(providerSchema),
  default: z.record(z.string(), z.string()),
});

export const providerStatusSchema = z.object({
  provider: providerSchema,
  connected: z.boolean(),
  defaultModel: z.string().optional(),
  authMethods: z.array(providerAuthMethodSchema),
  models: z.array(providerModelSchema),
});

export const providerStatusListSchema = z.array(providerStatusSchema);

export const providerApiKeyInputSchema = z.object({
  apiKey: z.string().trim().min(1),
});

export const providerOauthStartInputSchema = z.object({
  method: z.number().int().min(0),
  inputs: z.record(z.string(), z.string()).optional(),
});

export const providerOauthCompleteInputSchema = z.object({
  method: z.number().int().min(0),
  code: z.string().trim().min(1).optional(),
});

export const providerConnectResultSchema = z.object({
  success: z.boolean(),
});

export type ConfigProviders = z.infer<typeof configProvidersSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ProviderApiKeyInput = z.infer<typeof providerApiKeyInputSchema>;
export type ProviderAuthMethod = z.infer<typeof providerAuthMethodSchema>;
export type ProviderAuthMethods = z.infer<typeof providerAuthMethodsSchema>;
export type ProviderConnectResult = z.infer<typeof providerConnectResultSchema>;
export type ProviderList = z.infer<typeof providerListSchema>;
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type ProviderOauthAuthorization = z.infer<typeof providerOauthAuthorizationSchema>;
export type ProviderOauthCompleteInput = z.infer<typeof providerOauthCompleteInputSchema>;
export type ProviderOauthStartInput = z.infer<typeof providerOauthStartInputSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
