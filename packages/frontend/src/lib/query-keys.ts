export const queryKeys = {
  providers: ["providers"] as const,
  agents: ["agents"] as const,
  agentCatalog: ["agent-catalog"] as const,
  agentBySlug: (slug: string) => ["agent", slug] as const,
  conversationSnapshot: (agentId: string) => ["conversation-snapshot", agentId] as const,
  conversation: (agentId: string, conversationId: string) =>
    ["conversation", agentId, conversationId] as const,
  conversations: (agentId: string) => ["conversations", agentId] as const,
  conversationMedia: (conversationId: string) => ["conversation-media", conversationId] as const,
};
