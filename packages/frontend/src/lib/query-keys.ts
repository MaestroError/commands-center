export const queryKeys = {
  engineStatus: ["engine-status"] as const,
  providers: ["providers"] as const,
  mcpServers: ["mcp-servers"] as const,
  secrets: ["secrets"] as const,
  agents: ["agents"] as const,
  agentCatalog: ["agent-catalog"] as const,
  agentBySlug: (slug: string) => ["agent", slug] as const,
  agentCustomTools: (agentId: string) => ["agent-custom-tools", agentId] as const,
  customTools: ["custom-tools"] as const,
  workspaceSkills: ["workspace-skills"] as const,
  conversationSnapshot: (agentId: string) => ["conversation-snapshot", agentId] as const,
  conversation: (agentId: string, conversationId: string) =>
    ["conversation", agentId, conversationId] as const,
  conversations: (agentId: string) => ["conversations", agentId] as const,
  conversationMedia: (conversationId: string) => ["conversation-media", conversationId] as const,
};
