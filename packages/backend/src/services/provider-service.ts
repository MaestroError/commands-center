import {
  providerConnectResultSchema,
  providerOauthCompleteResultSchema,
  providerStatusListSchema,
  type ProviderAuthMethod,
  type ProviderModel,
  type ProviderStatus,
} from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { OpenCodeService } from "./opencode-service.js";

export type ProviderService = ReturnType<typeof createProviderService>;

export function createProviderService(options: {
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
}) {
  const directory = options.config.paths.workspaceDir;

  return {
    async list(): Promise<ProviderStatus[]> {
      await disposeWorkspaceInstance();

      const [providers, auth] = await Promise.all([
        options.opencodeService.listProviders(directory),
        options.opencodeService.listAuthMethods(directory),
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
      const providers = await options.opencodeService.listProviders(directory);

      return providers.all
        .filter((provider) => providers.connected.includes(provider.id))
        .flatMap((provider) => flattenModels(provider.id, provider.models));
    },

    async setApiKey(providerId: string, apiKey: string): Promise<boolean> {
      const result = await options.opencodeService.setApiKey(directory, providerId, apiKey);
      return providerConnectResultSchema.parse({ success: result }).success;
    },

    async startOauth(providerId: string, method: number, inputs?: Record<string, string>) {
      return options.opencodeService.startOauth(directory, providerId, method, inputs);
    },

    async completeOauth(providerId: string, method: number, code?: string) {
      const trimmedCode = readOauthCode(code);

      try {
        const result = await options.opencodeService.completeOauth(
          directory,
          providerId,
          method,
          trimmedCode,
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
      const result = await options.opencodeService.disconnectProvider(directory, providerId);
      return providerConnectResultSchema.parse({ success: result }).success;
    },
  };

  async function resolveOauthStatus(providerId: string, pending: boolean) {
    await disposeWorkspaceInstance();
    const providers = await options.opencodeService.listProviders(directory);
    const connected = providers.connected.includes(providerId);

    return providerOauthCompleteResultSchema.parse({
      connected,
      pending: connected ? false : pending,
      message: connected ? `Connected ${providerId}` : undefined,
    });
  }

  async function disposeWorkspaceInstance(): Promise<void> {
    try {
      await options.opencodeService.dispose(directory);
    } catch {
      // Ignore dispose failures and fall back to the current instance state.
    }
  }
}

function isPendingOauthError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /request timed out/i.test(text) || /ProviderAuthOauthMissing/i.test(text);
}

function readOauthCode(code?: string): string | undefined {
  const trimmed = code?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code")?.trim() || trimmed;
  } catch {
    return trimmed;
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
