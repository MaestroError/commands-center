import type { AgentCapabilitySelection } from "@cc/shared/schemas";

export function getMcpServerSelection(capabilities: AgentCapabilitySelection, serverName: string) {
  return capabilities.mcpServers.find((server) => server.name === serverName);
}

export function upsertMcpServerSelection(
  selections: AgentCapabilitySelection["mcpServers"],
  nextSelection: AgentCapabilitySelection["mcpServers"][number],
) {
  const remaining = selections.filter((server) => server.name !== nextSelection.name);
  return [...remaining, nextSelection];
}

export function setMcpServerEnabled(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  enabled: boolean,
): AgentCapabilitySelection {
  if (enabled) {
    return {
      ...capabilities,
      mcpServers: upsertMcpServerSelection(capabilities.mcpServers, {
        name: serverName,
        enabled: true,
        action: getMcpServerSelection(capabilities, serverName)?.action ?? "allow",
      }),
    };
  }

  return {
    ...capabilities,
    mcpServers: capabilities.mcpServers.filter((server) => server.name !== serverName),
    toolPermissions: capabilities.toolPermissions.filter(
      (rule) => !rule.pattern.startsWith(`${serverName}_`),
    ),
  };
}
