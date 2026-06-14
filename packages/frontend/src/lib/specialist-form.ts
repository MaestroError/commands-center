import type {
  Specialist,
  SpecialistCapabilitySelection,
  SpecialistCatalog,
  CustomToolAgentCopy,
} from "@cc/shared/schemas";

export type SpecialistFormState = {
  name: string;
  role: string;
  instructions: string;
  iconPath: string;
  defaultModel: string;
  capabilities: SpecialistCapabilitySelection;
  // Edit mode only: opt in to regenerating AGENTS.md from role/instructions.
  // Off by default so hand-edited rules are preserved on save.
  rewriteAgentsMd: boolean;
};

export type SpecialistFormErrors = Partial<
  Record<keyof Pick<SpecialistFormState, "name" | "role" | "instructions" | "defaultModel">, string>
>;

export function createEmptySpecialistForm(): SpecialistFormState {
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

export function createSpecialistFormFromSpecialist(
  catalog: SpecialistCatalog,
  specialist?: Specialist,
): SpecialistFormState {
  const existingCapabilities = specialist?.capabilities ?? createEmptySpecialistForm().capabilities;

  return {
    name: specialist?.name ?? "",
    role: specialist?.role ?? "",
    instructions: specialist?.instructions ?? "",
    iconPath: specialist?.iconPath ?? "",
    defaultModel: resolveInitialModelId(catalog, specialist?.defaultModel),
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

export function validateSpecialistForm(
  form: SpecialistFormState,
  options: { hasProviderModels: boolean; slugTaken: boolean },
): SpecialistFormErrors {
  return {
    name: !form.name.trim()
      ? "Name is required."
      : options.slugTaken
        ? `Identifier '${specialistFormSlug(form.name)}' is already in use.`
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
  specialistTools: CustomToolAgentCopy[],
): string[] | undefined {
  const collisions = specialistTools.filter(
    (tool) =>
      selectedSlugs.includes(tool.slug) && (!tool.isManaged || tool.sourceToolSlug !== tool.slug),
  );

  if (collisions.length === 0) {
    return [];
  }

  const confirmed = window.confirm(
    `The specialist already has local tool copies for: ${collisions.map((tool) => tool.slug).join(", ")}. Overwrite them with the selected global versions?`,
  );

  return confirmed ? collisions.map((tool) => tool.slug) : undefined;
}

export function specialistFormSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "specialist";
}

export function resolveInitialModelId(catalog: SpecialistCatalog, currentModel?: string): string {
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
