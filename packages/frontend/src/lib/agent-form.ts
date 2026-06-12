import type {
  Agent,
  AgentCapabilitySelection,
  AgentCatalog,
  CustomToolAgentCopy,
} from "@cc/shared/schemas";

export type AgentFormState = {
  name: string;
  role: string;
  instructions: string;
  iconPath: string;
  defaultModel: string;
  capabilities: AgentCapabilitySelection;
  // Edit mode only: opt in to regenerating AGENTS.md from role/instructions.
  // Off by default so hand-edited rules are preserved on save.
  rewriteAgentsMd: boolean;
};

export type AgentFormErrors = Partial<
  Record<keyof Pick<AgentFormState, "name" | "role" | "instructions" | "defaultModel">, string>
>;

export function createEmptyAgentForm(): AgentFormState {
  return {
    name: "",
    role: "",
    instructions: "",
    iconPath: "",
    defaultModel: "",
    capabilities: {
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
    rewriteAgentsMd: false,
  };
}

export function createAgentFormFromAgent(catalog: AgentCatalog, agent?: Agent): AgentFormState {
  const existingCapabilities = agent?.capabilities ?? createEmptyAgentForm().capabilities;

  return {
    name: agent?.name ?? "",
    role: agent?.role ?? "",
    instructions: agent?.instructions ?? "",
    iconPath: agent?.iconPath ?? "",
    defaultModel: resolveInitialModelId(catalog, agent?.defaultModel),
    capabilities: {
      builtInSkills: existingCapabilities.builtInSkills,
      workspaceSkills: existingCapabilities.workspaceSkills ?? [],
      customTools: existingCapabilities.customTools,
      mcpServers: existingCapabilities.mcpServers,
      toolPermissions: existingCapabilities.toolPermissions,
      appMcpServers: existingCapabilities.appMcpServers ?? [],
      appToolPermissions: existingCapabilities.appToolPermissions ?? [],
    },
    rewriteAgentsMd: false,
  };
}

export function validateAgentForm(
  form: AgentFormState,
  options: { hasProviderModels: boolean; slugTaken: boolean },
): AgentFormErrors {
  return {
    name: !form.name.trim()
      ? "Name is required."
      : options.slugTaken
        ? `Identifier '${agentFormSlug(form.name)}' is already in use.`
        : undefined,
    role: form.role.trim() ? undefined : "Role is required.",
    instructions: form.instructions.trim() ? undefined : "Instructions are required.",
    defaultModel:
      options.hasProviderModels && form.defaultModel.trim()
        ? undefined
        : "A default model is required.",
  };
}

export function resolveCustomToolOverwriteSlugs(
  selectedSlugs: string[],
  agentTools: CustomToolAgentCopy[],
): string[] | undefined {
  const collisions = agentTools.filter(
    (tool) =>
      selectedSlugs.includes(tool.slug) && (!tool.isManaged || tool.sourceToolSlug !== tool.slug),
  );

  if (collisions.length === 0) {
    return [];
  }

  const confirmed = window.confirm(
    `The agent already has local tool copies for: ${collisions.map((tool) => tool.slug).join(", ")}. Overwrite them with the selected global versions?`,
  );

  return confirmed ? collisions.map((tool) => tool.slug) : undefined;
}

export function agentFormSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "agent";
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
