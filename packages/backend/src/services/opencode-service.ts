import type { OpencodeClient } from "../lib/opencode-client.js";
import { createScopedOpenCodeClient } from "../lib/opencode-client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

import {
  configProvidersSchema,
  providerAuthMethodsSchema,
  providerListSchema,
  providerOauthAuthorizationSchema,
  type ProviderAuthMethods,
  type ProviderList,
  type ProviderOauthAuthorization,
} from "@cc/shared/schemas";

export type OpenCodeService = ReturnType<typeof createOpenCodeService>;

export function createOpenCodeService(options: { client: OpencodeClient; config: RuntimeConfig }) {
  return {
    async dispose(directory: string): Promise<void> {
      const scoped = createScopedOpenCodeClient(options.config, directory);

      try {
        await scoped.instance.dispose();
      } catch {
        // Ignore dispose failures — fall back to stale instance state.
      }
    },

    async listProviders(directory: string): Promise<ProviderList> {
      const scoped = createScopedOpenCodeClient(options.config, directory);

      try {
        const result = await scoped.provider.list();
        return providerListSchema.parse(result);
      } catch {
        const result = await scoped.config.providers();
        const fallback = configProvidersSchema.parse(result);

        return providerListSchema.parse({
          all: fallback.providers,
          default: fallback.default,
          connected: fallback.providers.map((provider) => provider.id),
        });
      }
    },

    async listAuthMethods(directory: string): Promise<ProviderAuthMethods> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.auth();
      return providerAuthMethodsSchema.parse(result);
    },

    async setApiKey(directory: string, providerId: string, apiKey: string): Promise<boolean> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.auth.set({
        path: { id: providerId },
        body: { type: "api", key: apiKey },
      });

      return (result as unknown) === true;
    },

    async startOauth(
      directory: string,
      providerId: string,
      method: number,
      inputs?: Record<string, string>,
    ): Promise<ProviderOauthAuthorization> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.oauth.authorize({
        path: { id: providerId },
        body: { method, ...inputs },
      });

      return providerOauthAuthorizationSchema.parse(result);
    },

    async completeOauth(
      directory: string,
      providerId: string,
      method: number,
      code?: string,
    ): Promise<boolean> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.oauth.callback({
        path: { id: providerId },
        body: { method, code },
      });

      return (result as unknown) === true;
    },

    async disconnectProvider(directory: string, providerId: string): Promise<boolean> {
      // The SDK does not expose DELETE /auth/{id} — use raw fetch.
      const url = new URL(
        `/auth/${encodeURIComponent(providerId)}`,
        options.config.opencode.baseUrl,
      );
      url.searchParams.set("directory", directory);

      const response = await fetch(url, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Failed to disconnect provider ${providerId}: ${String(response.status)}`);
      }

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        return (await response.json()) === true;
      }

      return true;
    },
  };
}
