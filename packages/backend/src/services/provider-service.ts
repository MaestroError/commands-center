import { providerModelSchema } from "@cc/shared/schemas";
import type {
  ProviderModel,
  ProviderStatus,
  ProviderOauthAuthorization,
  ProviderOauthCompleteResult,
} from "@cc/shared/schemas";
import type { OpenCodeService } from "./opencode-service.js";

export type ProviderService = {
  list(): Promise<ProviderStatus[]>;
  listModels(): Promise<ProviderModel[]>;
  setApiKey(providerId: string, apiKey: string): Promise<boolean>;
  startOauth(
    providerId: string,
    method: number,
    inputs?: Record<string, string>,
  ): Promise<ProviderOauthAuthorization>;
  completeOauth(
    providerId: string,
    method: number,
    code?: string,
  ): Promise<ProviderOauthCompleteResult>;
  disconnect(providerId: string): Promise<boolean>;
};

export async function listProviderModels(
  engine: Pick<OpenCodeService, "listProviders">,
  directory: string,
): Promise<ProviderModel[]> {
  const providers = await engine.listProviders(directory);
  return providers.all
    .filter((provider) => providers.connected.includes(provider.id))
    .flatMap((provider) => flattenModels(provider.id, provider.models));
}

function flattenModels(providerId: string, models: Record<string, unknown>): ProviderModel[] {
  return Object.entries(models)
    .map(([id, value]) => {
      const name = readModelName(value);

      return providerModelSchema.parse({
        ...(value && typeof value === "object" ? value : {}),
        id,
        name,
        providerId,
      });
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readModelName(value: unknown): string {
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name;
  }

  return "Unknown model";
}
