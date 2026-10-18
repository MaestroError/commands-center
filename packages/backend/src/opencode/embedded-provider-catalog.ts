import type { ProviderList } from "@cc/shared/schemas";

import type { EmbeddedOpenCodeHost } from "./embedded-host.js";

export async function listEmbeddedProviders(
  host: Pick<EmbeddedOpenCodeHost, "provider" | "model">,
  directory: string,
): Promise<ProviderList> {
  const location = { directory };
  const [models, selected] = await Promise.all([
    host.model.list({ location }),
    host.model.default({ location }),
  ]);
  const providers = await host.provider.list({ location });
  return {
    all: providers.data.map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: "config",
      env: [],
      models: Object.fromEntries(
        models.data
          .filter((model) => model.providerID === provider.id && model.enabled)
          .map((model) => [
            model.id,
            {
              name: model.name,
              variants: model.variants.map((variant) => variant.id),
              defaultVariant:
                typeof model.settings?.["reasoningEffort"] === "string"
                  ? model.settings["reasoningEffort"]
                  : undefined,
            },
          ]),
      ),
    })),
    connected: [
      ...new Set(models.data.filter((model) => model.enabled).map((model) => model.providerID)),
    ],
    default: selected.data ? { [selected.data.providerID]: selected.data.id } : {},
  };
}
