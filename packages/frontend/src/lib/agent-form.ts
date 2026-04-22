import type { Agent, AgentCatalog } from "@cc/shared/schemas";

export type SessionSettingsFormState = {
  defaultModel: string;
  role: string;
  instructions: string;
};

export type SessionSettingsFormErrors = Partial<Record<keyof SessionSettingsFormState, string>>;

export function createSessionSettingsForm(
  catalog: AgentCatalog,
  agent: Agent,
): SessionSettingsFormState {
  return {
    defaultModel: resolveInitialModelId(catalog, agent.defaultModel),
    role: agent.role,
    instructions: agent.instructions,
  };
}

export function validateSessionSettingsForm(
  form: SessionSettingsFormState,
  hasProviderModels: boolean,
): SessionSettingsFormErrors {
  return {
    defaultModel:
      hasProviderModels && form.defaultModel.trim() ? undefined : "A default model is required.",
    role: form.role.trim() ? undefined : "Role is required.",
    instructions: form.instructions.trim() ? undefined : "Instructions are required.",
  };
}

export function resolveInitialModelId(catalog: AgentCatalog, currentModel?: string): string {
  if (!currentModel) {
    return catalog.providerModels[0]?.id ?? "";
  }

  const exactMatch = catalog.providerModels.find((model) => model.id === currentModel);

  if (exactMatch) {
    return exactMatch.id;
  }

  const suffixMatches = catalog.providerModels.filter((model) =>
    model.id.endsWith(`/${currentModel}`),
  );

  if (suffixMatches.length === 1) {
    return suffixMatches[0]!.id;
  }

  return currentModel;
}
