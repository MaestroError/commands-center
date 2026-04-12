export const queryKeys = {
  providers: ["providers"] as const,
  agents: ["agents"] as const,
  agentCatalog: ["agent-catalog"] as const,
  agentBySlug: (slug: string) => ["agent", slug] as const,
};
