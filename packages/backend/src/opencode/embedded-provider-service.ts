import {
  providerModelSchema,
  providerStatusListSchema,
  type ProviderAuthMethod,
} from "@cc/shared/schemas";

import { BadRequestError } from "../lib/api-error.js";
import type { ProviderService } from "../services/provider-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import { listEmbeddedProviders } from "./embedded-provider-catalog.js";

type ProviderHost = Pick<EmbeddedOpenCodeHost, "provider" | "model" | "integration" | "credential">;
type Integration = Awaited<ReturnType<ProviderHost["integration"]["get"]>>["data"];
type Method = Integration["methods"][number];
type Attempt = { integrationID: string; attemptID: string; mode: "auto" | "code" };

export function createEmbeddedProviderService(
  host: ProviderHost,
  directory: string,
): ProviderService {
  const location = { directory };
  const attempts = new Map<string, Attempt>();

  async function integrationFor(providerId: string): Promise<Integration> {
    await host.integration.list({ location });
    const provider = await host.provider.get({ location, providerID: providerId });
    if (!provider.data.integrationID)
      throw new BadRequestError("Provider has no authentication integration.");
    return (await host.integration.get({ location, integrationID: provider.data.integrationID }))
      .data;
  }

  async function list() {
    const [catalog, integrations] = await Promise.all([
      listEmbeddedProviders(host, directory),
      host.integration.list({ location }),
    ]);
    const providers = await host.provider.list({ location });
    for (const integration of integrations.data) {
      if (
        providers.data.some(
          (provider) => (provider.integrationID ?? provider.id) === integration.id,
        )
      )
        continue;
      try {
        const { data: provider } = await host.provider.get({
          location,
          providerID: integration.id,
        });
        providers.data.push(provider);
        catalog.all.push({
          id: provider.id,
          name: provider.name,
          source: "config",
          env: [],
          models: {},
        });
      } catch (error) {
        if (!(error instanceof Error && error.name === "ProviderNotFoundError")) throw error;
      }
    }
    return providerStatusListSchema.parse(
      catalog.all.map((provider) => {
        const integrationID =
          providers.data.find((item) => item.id === provider.id)?.integrationID ?? provider.id;
        const integration = integrations.data.find((item) => item.id === integrationID);
        return {
          provider: {
            ...provider,
            source: integration?.connections.some((connection) => connection.type === "env")
              ? "env"
              : integration?.connections.some((connection) => connection.type === "credential")
                ? "api"
                : "config",
            env:
              integration?.connections.flatMap((connection) =>
                connection.type === "env" ? [connection.name] : [],
              ) ?? [],
          },
          connected: catalog.connected.includes(provider.id),
          defaultModel: catalog.default[provider.id],
          authMethods:
            integration?.methods.flatMap((method) => {
              const mapped = mapMethod(method);
              return mapped ? [mapped] : [];
            }) ?? [],
          models: Object.entries(provider.models)
            .map(([id, value]) =>
              providerModelSchema.parse({
                id,
                providerId: provider.id,
                ...(value && typeof value === "object" ? value : {}),
              }),
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    );
  }

  return {
    list,
    async listModels() {
      return (await list())
        .filter((provider) => provider.connected)
        .flatMap((provider) => provider.models);
    },
    async setApiKey(providerId, key) {
      const integration = await integrationFor(providerId);
      if (!integration.methods.some((method) => method.type === "key" && mapMethod(method))) {
        throw new BadRequestError("Provider does not support a standalone API key.");
      }
      await host.integration.connect.key({ location, integrationID: integration.id, key });
      return true;
    },
    async startOauth(providerId, methodIndex, inputs) {
      const integration = await integrationFor(providerId);
      const method = integration.methods.filter((item) => mapMethod(item))[methodIndex];
      if (method?.type !== "oauth") throw new BadRequestError("OAuth method not found.");
      const key = JSON.stringify([providerId, methodIndex]);
      const previous = attempts.get(key);
      if (previous) {
        await host.integration.oauth.cancel({
          location,
          integrationID: previous.integrationID,
          attemptID: previous.attemptID,
        });
        attempts.delete(key);
      }
      const { data } = await host.integration.oauth.connect({
        location,
        integrationID: integration.id,
        methodID: method.id,
        answer: inputs,
      });
      attempts.set(key, {
        integrationID: integration.id,
        attemptID: data.attemptID,
        mode: data.mode,
      });
      return { url: data.url, method: data.mode, instructions: data.instructions };
    },
    async completeOauth(providerId, methodIndex, code) {
      const key = JSON.stringify([providerId, methodIndex]);
      const attempt = attempts.get(key);
      if (!attempt)
        throw new BadRequestError("Start provider authorization again; no pending attempt exists.");
      const input = {
        location,
        integrationID: attempt.integrationID,
        attemptID: attempt.attemptID,
      };
      let { data } = await host.integration.oauth.status(input);
      if (data.status === "pending" && attempt.mode === "code" && code?.trim()) {
        let value = code.trim();
        try {
          value = new URL(value).searchParams.get("code") ?? value;
        } catch {
          /* Raw authorization code. */
        }
        await host.integration.oauth.complete({ ...input, code: value });
        data = (await host.integration.oauth.status(input)).data;
      }
      if (data.status === "pending") return { connected: false, pending: true };
      attempts.delete(key);
      if (data.status === "failed") throw new BadRequestError(data.message);
      if (data.status === "expired")
        throw new BadRequestError("Authorization expired. Start provider authorization again.");
      return { connected: true, pending: false, message: `Connected ${providerId}` };
    },
    async disconnect(providerId) {
      const integration = await integrationFor(providerId);
      if (integration.connections.some((connection) => connection.type === "env")) {
        throw new BadRequestError(
          "Remove the provider's environment credentials and restart CC to disconnect it.",
        );
      }
      for (const [key, attempt] of attempts) {
        if (attempt.integrationID !== integration.id) continue;
        await host.integration.oauth.cancel({
          location,
          integrationID: attempt.integrationID,
          attemptID: attempt.attemptID,
        });
        attempts.delete(key);
      }
      for (const credential of await host.credential.list()) {
        if (credential.integrationID === integration.id) {
          await host.credential.remove({ credentialID: credential.id });
        }
      }
      return true;
    },
  };
}

function mapMethod(method: Method): ProviderAuthMethod | undefined {
  if (method.type !== "key" && method.type !== "oauth") return undefined;
  // CC's API-key dialog accepts only a key; other v2 forms need dedicated controls.
  if (method.type === "key")
    return method.form ? undefined : { type: "api", label: method.label ?? "API key" };
  const prompts: NonNullable<ProviderAuthMethod["prompts"]> = [];
  for (const field of method.form ?? []) {
    if (field.type !== "string" || field.hidden || (field.when?.length ?? 0) > 1) return undefined;
    const condition = field.when?.[0];
    if (condition && typeof condition.value !== "string") return undefined;
    const base = {
      key: field.key,
      message: field.title ?? field.description ?? field.key,
      when: condition
        ? { key: condition.key, op: condition.op, value: String(condition.value) }
        : undefined,
    };
    prompts.push(
      field.options && !field.custom
        ? {
            ...base,
            type: "select",
            options: field.options.map((option) => ({
              label: option.label,
              value: option.value,
              hint: option.description,
            })),
          }
        : { ...base, type: "text", placeholder: field.placeholder },
    );
  }
  return { type: "oauth", label: method.label, prompts };
}
