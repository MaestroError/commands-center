import {
  configProvidersSchema,
  providerAuthMethodsSchema,
  providerConnectResultSchema,
  providerListSchema,
  providerOauthAuthorizationSchema,
  providerOauthCompleteResultSchema,
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
      const [providers, auth] = await Promise.all([
        listProviders({ dispose: true }),
        listAuthMethods(),
      ]);

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

    async completeOauth(providerId: string, method: number, code?: string) {
      const trimmedCode = code?.trim();

      try {
        const result = await client.request<boolean>(
          `/provider/${encodeURIComponent(providerId)}/oauth/callback`,
          {
            method: "POST",
            body: {
              method,
              code: trimmedCode || undefined,
            },
            timeoutMs: trimmedCode
              ? options.config.timeouts.providerAuthMs
              : Math.min(options.config.timeouts.providerAuthMs, 5_000),
          },
        );

        if (providerConnectResultSchema.parse({ success: result }).success) {
          return resolveOauthStatus(providerId, false);
        }
      } catch (error) {
        if (isPendingOauthError(error)) {
          return resolveOauthStatus(providerId, true);
        }

        throw error;
      }

      return resolveOauthStatus(providerId, false);
    },

    async disconnect(providerId: string): Promise<boolean> {
      const result = await client.request<boolean>(`/auth/${encodeURIComponent(providerId)}`, {
        method: "DELETE",
        timeoutMs: options.config.timeouts.providerAuthMs,
      });

      return providerConnectResultSchema.parse({ success: result }).success;
    },
  };

  async function listProvidersWithOptions(optionsArg: { dispose: boolean }) {
    if (optionsArg.dispose) {
      await disposeWorkspaceInstance();
    }

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

  async function listProviders(optionsArg?: { dispose: boolean }) {
    return listProvidersWithOptions({ dispose: optionsArg?.dispose ?? false });
  }

  async function listAuthMethods() {
    const result = await client.request("/provider/auth", {
      timeoutMs: options.config.timeouts.providerAuthMs,
    });

    return providerAuthMethodsSchema.parse(result);
  }

  async function resolveOauthStatus(providerId: string, pending: boolean) {
    const providers = await listProviders({ dispose: true });
    const connected = providers.connected.includes(providerId);

    return providerOauthCompleteResultSchema.parse({
      connected,
      pending: connected ? false : pending,
      message: connected ? `Connected ${providerId}` : undefined,
    });
  }

  async function disposeWorkspaceInstance(): Promise<void> {
    try {
      await client.disposeInstance();
    } catch {
      // Ignore dispose failures and fall back to the current instance state.
    }
  }
}

function isPendingOauthError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /request timed out/i.test(text) || /ProviderAuthOauthMissing/i.test(text);
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
