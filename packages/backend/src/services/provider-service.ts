import {
  configProvidersSchema,
  providerAuthMethodsSchema,
  providerConnectResultSchema,
  providerListSchema,
  providerOauthAuthorizationSchema,
  providerStatusListSchema,
  type ProviderAuthMethod,
  type ProviderModel,
  type ProviderStatus,
} from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";

export type ProviderService = ReturnType<typeof createProviderService>;

export function createProviderService(options: {
  config: RuntimeConfig;
  orchestrator: OpenCodeOrchestrator;
}) {
  const client = options.orchestrator.createWorkspaceClient({
    directory: options.config.paths.workspaceDir,
  });

  return {
    async list(): Promise<ProviderStatus[]> {
      const [providers, auth] = await Promise.all([listProviders(), listAuthMethods()]);

      return providerStatusListSchema.parse(
        providers.all.map((provider) => ({
          provider,
          connected: providers.connected.includes(provider.id),
          defaultModel: providers.default[provider.id],
          authMethods: mergeAuthMethods(provider, auth[provider.id] ?? []),
          models: flattenModels(provider.id, provider.models),
        })),
      );
    },

    async listModels(): Promise<ProviderModel[]> {
      const providers = await listProviders();

      return providers.all
        .filter((provider) => providers.connected.includes(provider.id))
        .flatMap((provider) => flattenModels(provider.id, provider.models));
    },

    async setApiKey(providerId: string, apiKey: string): Promise<boolean> {
      const result = await client.request<boolean>(`/auth/${encodeURIComponent(providerId)}`, {
        method: "PUT",
        body: {
          type: "api",
          key: apiKey,
        },
        timeoutMs: options.config.timeouts.providerAuthMs,
      });

      return providerConnectResultSchema.parse({ success: result }).success;
    },

    async startOauth(providerId: string, method: number, inputs?: Record<string, string>) {
      const result = await client.request(
        `/provider/${encodeURIComponent(providerId)}/oauth/authorize`,
        {
          method: "POST",
          body: {
            method,
            inputs,
          },
          timeoutMs: options.config.timeouts.providerAuthMs,
        },
      );

      return providerOauthAuthorizationSchema.parse(result);
    },

    async completeOauth(providerId: string, method: number, code?: string): Promise<boolean> {
      const result = await client.request<boolean>(
        `/provider/${encodeURIComponent(providerId)}/oauth/callback`,
        {
          method: "POST",
          body: {
            method,
            code,
          },
          timeoutMs: options.config.timeouts.providerAuthMs,
        },
      );

      return providerConnectResultSchema.parse({ success: result }).success;
    },

    async disconnect(providerId: string): Promise<boolean> {
      const result = await client.request<boolean>(`/auth/${encodeURIComponent(providerId)}`, {
        method: "DELETE",
        timeoutMs: options.config.timeouts.providerAuthMs,
      });

      return providerConnectResultSchema.parse({ success: result }).success;
    },
  };

  async function listProviders() {
    try {
      const result = await client.request("/provider");
      return providerListSchema.parse(result);
    } catch {
      const result = await client.request("/config/providers");
      const fallback = configProvidersSchema.parse(result);

      return providerListSchema.parse({
        all: fallback.providers,
        default: fallback.default,
        connected: fallback.providers.map((provider) => provider.id),
      });
    }
  }

  async function listAuthMethods() {
    const result = await client.request("/provider/auth", {
      timeoutMs: options.config.timeouts.providerAuthMs,
    });

    return providerAuthMethodsSchema.parse(result);
  }
}

function mergeAuthMethods(
  provider: ProviderStatus["provider"],
  authMethods: ProviderAuthMethod[],
): ProviderAuthMethod[] {
  if (provider.env.length === 0 || authMethods.some((method) => method.type === "api")) {
    return authMethods;
  }

  return [...authMethods, { type: "api", label: "API key" }];
}

function flattenModels(providerId: string, models: Record<string, unknown>): ProviderModel[] {
  return Object.entries(models)
    .map(([id, value]) => {
      const name = readModelName(value);

      return {
        id,
        name,
        providerId,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readModelName(value: unknown): string {
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name;
  }

  return "Unknown model";
}
