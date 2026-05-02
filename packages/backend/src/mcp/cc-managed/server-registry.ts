export type CcManagedToolDefinition = {
  name: string;
  description: string;
};

export type CcManagedMcpServerDefinition = {
  name: string;
  routeSegment: string;
  description: string;
  enabledByDefault: boolean;
  tools: readonly CcManagedToolDefinition[];
};

const CC_MANAGED_MCP_SERVERS = [
  {
    name: "cc_app",
    routeSegment: "cc-app",
    description: "CommandsCenter app-managed capabilities for this agent.",
    enabledByDefault: false,
    tools: [],
  },
] as const satisfies readonly CcManagedMcpServerDefinition[];

export function listCcManagedMcpServers(): readonly CcManagedMcpServerDefinition[] {
  return CC_MANAGED_MCP_SERVERS;
}

export function getCcManagedMcpServer(name: string): CcManagedMcpServerDefinition | undefined {
  return CC_MANAGED_MCP_SERVERS.find((server) => server.name === name);
}

export function getCcManagedMcpServerByRouteSegment(
  routeSegment: string,
): CcManagedMcpServerDefinition | undefined {
  return CC_MANAGED_MCP_SERVERS.find((server) => server.routeSegment === routeSegment);
}
