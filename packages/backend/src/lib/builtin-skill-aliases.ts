const BUILT_IN_SKILL_ALIASES = {
  "custom-skill-authoring": "global-skill-authoring",
  "custom-tool-authoring": "global-tool-authoring",
} as const;

export function normalizeBuiltInSkillSlug(slug: string): string {
  return BUILT_IN_SKILL_ALIASES[slug as keyof typeof BUILT_IN_SKILL_ALIASES] ?? slug;
}

export function normalizeBuiltInSkillSlugs(slugs: readonly string[] = []): string[] {
  return Array.from(new Set(slugs.map(normalizeBuiltInSkillSlug)));
}
