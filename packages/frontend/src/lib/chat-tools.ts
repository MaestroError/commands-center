import type {
  CustomTool,
  CustomToolAgentCopy,
  McpServer,
  Specialist,
  SpecialistCatalog,
  SpecialistPermissionRule,
} from "@cc/shared/schemas";

export type ChatToolAction = "allow" | "ask";
export type ChatToolContext = "chat" | "task_run" | "both";

export type ChatToolSummary = {
  ccManaged: CcManagedToolGroup[];
  customTools: CustomToolSummary[];
  externalMcp: ExternalMcpServerSummary[];
  totalCount: number;
};

export type CcManagedToolGroup = {
  serverName: string;
  description: string;
  enabledByDefault: boolean;
  systemManaged: boolean;
  tools: CcManagedToolSummary[];
};

export type CcManagedToolSummary = {
  name: string;
  description: string;
  context: ChatToolContext;
  action: ChatToolAction;
};

export type CustomToolSummary = {
  slug: string;
  name: string;
  description: string;
  source: "managed" | "local" | "missing_global";
  status?: CustomToolAgentCopy["status"];
  enabled: boolean;
};

export type ExternalMcpServerSummary = {
  serverName: string;
  action: ChatToolAction;
  globalEnabled?: boolean;
  runtimeStatus?: McpServer["runtimeStatus"];
  tools: ExternalMcpToolSummary[];
  permissionPatterns: SpecialistPermissionRule[];
};

export type ExternalMcpToolSummary = {
  id: string;
  name: string;
  action: ChatToolAction;
};

type CatalogCustomTool = SpecialistCatalog["customTools"][number];

type ChatToolSummaryInput = {
  agent: Specialist;
  catalog?: SpecialistCatalog;
  globalCustomTools?: Array<CustomTool | CatalogCustomTool>;
  specialistCustomTools?: CustomToolAgentCopy[];
  mcpServers?: McpServer[];
};

export function buildChatToolSummary(input: ChatToolSummaryInput): ChatToolSummary {
  const ccManaged = buildCcManagedGroups(input.agent, input.catalog);
  const customTools = buildCustomTools(input.agent, {
    catalogTools: input.catalog?.customTools ?? [],
    globalTools: input.globalCustomTools ?? [],
    specialistTools: input.specialistCustomTools ?? [],
  });
  const externalMcp = buildExternalMcpServers(input.agent, input.mcpServers ?? []);

  return {
    ccManaged,
    customTools,
    externalMcp,
    totalCount:
      ccManaged.reduce((sum, group) => sum + group.tools.length, 0) +
      customTools.length +
      externalMcp.reduce((sum, server) => sum + Math.max(server.tools.length, 1), 0),
  };
}

function buildCcManagedGroups(
  agent: Specialist,
  catalog: SpecialistCatalog | undefined,
): CcManagedToolGroup[] {
  return (catalog?.ccManagedMcpServers ?? [])
    .map((server) => {
      const selection = agent.capabilities.appMcpServers?.find(
        (entry) => entry.name === server.name,
      );
      const enabled = selection
        ? selection.enabled !== false && selection.action !== "deny"
        : server.enabledByDefault;

      if (!enabled) {
        return undefined;
      }

      const serverAction = selection?.action === "ask" ? "ask" : "allow";
      const tools = server.tools
        .map((tool) => {
          const rule = findRule(
            agent.capabilities.appToolPermissions ?? [],
            `${server.name}_${tool.name}`,
          );

          if (rule?.action === "deny") {
            return undefined;
          }

          return {
            name: tool.name,
            description: tool.description,
            context: tool.context,
            action: resolveToolAction(serverAction, rule),
          } satisfies CcManagedToolSummary;
        })
        .filter((tool): tool is CcManagedToolSummary => tool !== undefined);

      if (tools.length === 0) {
        return undefined;
      }

      return {
        serverName: server.name,
        description: server.description,
        enabledByDefault: server.enabledByDefault,
        systemManaged: server.systemManaged,
        tools,
      } satisfies CcManagedToolGroup;
    })
    .filter((group): group is CcManagedToolGroup => group !== undefined);
}

function buildCustomTools(
  agent: Specialist,
  input: {
    catalogTools: CatalogCustomTool[];
    globalTools: Array<CustomTool | CatalogCustomTool>;
    specialistTools: CustomToolAgentCopy[];
  },
): CustomToolSummary[] {
  const selectedSlugs = agent.capabilities.customTools ?? [];
  const globalBySlug = new Map(
    [...input.catalogTools, ...input.globalTools].map((tool) => [tool.slug, tool]),
  );
  const specialistBySlug = new Map(input.specialistTools.map((tool) => [tool.slug, tool]));
  const summaries = new Map<string, CustomToolSummary>();

  for (const slug of selectedSlugs) {
    const specialistTool = specialistBySlug.get(slug);

    if (specialistTool) {
      summaries.set(slug, mapSpecialistTool(specialistTool));
      continue;
    }

    const globalTool = globalBySlug.get(slug);
    summaries.set(
      slug,
      globalTool
        ? {
            slug,
            name: globalTool.name,
            description: globalTool.description,
            source: "managed",
            enabled: globalTool.enabled,
          }
        : {
            slug,
            name: slug,
            description: "",
            source: "missing_global",
            enabled: false,
          },
    );
  }

  for (const tool of input.specialistTools) {
    if (!summaries.has(tool.slug)) {
      summaries.set(tool.slug, mapSpecialistTool(tool));
    }
  }

  return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function mapSpecialistTool(tool: CustomToolAgentCopy): CustomToolSummary {
  return {
    slug: tool.slug,
    name: tool.name,
    description: tool.description,
    source: tool.isManaged ? "managed" : "local",
    status: tool.status,
    enabled: true,
  };
}

function buildExternalMcpServers(
  agent: Specialist,
  mcpServers: McpServer[],
): ExternalMcpServerSummary[] {
  const serversByName = new Map(mcpServers.map((server) => [server.name, server]));
  const summaries: ExternalMcpServerSummary[] = [];

  for (const selection of agent.capabilities.mcpServers ?? []) {
    if (selection.enabled === false || selection.action === "deny") {
      continue;
    }

    const server = serversByName.get(selection.name);
    const permissionPatterns = (agent.capabilities.toolPermissions ?? []).filter((rule) =>
      rule.pattern.startsWith(`${selection.name}_`),
    );
    const tools =
      server?.tools
        .map((tool) => {
          const rule = findMatchingRule(permissionPatterns, tool.id);

          if (rule?.action === "deny") {
            return undefined;
          }

          return {
            id: tool.id,
            name: tool.name,
            action: resolveToolAction(selection.action === "ask" ? "ask" : "allow", rule),
          } satisfies ExternalMcpToolSummary;
        })
        .filter((tool): tool is ExternalMcpToolSummary => tool !== undefined) ?? [];

    summaries.push({
      serverName: selection.name,
      action: selection.action === "ask" ? "ask" : "allow",
      ...(server ? { globalEnabled: server.enabled, runtimeStatus: server.runtimeStatus } : {}),
      tools,
      permissionPatterns,
    });
  }

  return summaries.sort((a, b) => a.serverName.localeCompare(b.serverName));
}

function findRule(
  rules: SpecialistPermissionRule[],
  pattern: string,
): SpecialistPermissionRule | undefined {
  return rules.find((rule) => rule.pattern === pattern);
}

function resolveToolAction(
  serverAction: ChatToolAction,
  rule: SpecialistPermissionRule | undefined,
): ChatToolAction {
  if (rule?.action === "allow" || rule?.action === "ask") {
    return rule.action;
  }

  return serverAction;
}

function findMatchingRule(
  rules: SpecialistPermissionRule[],
  toolId: string,
): SpecialistPermissionRule | undefined {
  const exact = rules.find((rule) => rule.pattern === toolId);

  if (exact) {
    return exact;
  }

  return rules.reduce<SpecialistPermissionRule | undefined>((best, rule) => {
    if (rule.pattern === toolId || !wildcardMatches(rule.pattern, toolId)) {
      return best;
    }

    if (!best) {
      return rule;
    }

    const currentSpecificity = ruleSpecificity(rule.pattern);
    const bestSpecificity = ruleSpecificity(best.pattern);

    return currentSpecificity >= bestSpecificity ? rule : best;
  }, undefined);
}

function wildcardMatches(pattern: string, value: string): boolean {
  if (pattern === value) {
    return true;
  }

  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function ruleSpecificity(pattern: string): number {
  return pattern.replaceAll("*", "").length;
}
