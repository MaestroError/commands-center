import type {
  AgentCapabilitySelection,
  AgentMcpServer,
  AgentPermissionRule,
} from "@cc/shared/schemas";

type MutableServerSelection = {
  name: string;
  enabled?: boolean;
  action: AgentMcpServer["action"];
};

export function getMcpServerSelection(capabilities: AgentCapabilitySelection, serverName: string) {
  return (capabilities.mcpServers ?? []).find((server) => server.name === serverName);
}

export function getAppMcpServerSelection(
  capabilities: AgentCapabilitySelection,
  serverName: string,
) {
  return (capabilities.appMcpServers ?? []).find((server) => server.name === serverName);
}

export function upsertMcpServerSelection(
  selections: MutableServerSelection[] | undefined,
  nextSelection: MutableServerSelection,
) {
  const remaining = (selections ?? []).filter((server) => server.name !== nextSelection.name);
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
      mcpServers: upsertMcpServerSelection(capabilities.mcpServers ?? [], {
        name: serverName,
        enabled: true,
        action: getMcpServerSelection(capabilities, serverName)?.action ?? "allow",
      }),
    };
  }

  return {
    ...capabilities,
    mcpServers: (capabilities.mcpServers ?? []).filter((server) => server.name !== serverName),
    toolPermissions: (capabilities.toolPermissions ?? []).filter(
      (rule) => !rule.pattern.startsWith(`${serverName}_`),
    ),
  };
}

export function setMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  action: AgentMcpServer["action"],
): AgentCapabilitySelection {
  if (action === "deny") {
    return setMcpServerEnabled(capabilities, serverName, false);
  }

  return {
    ...capabilities,
    mcpServers: upsertMcpServerSelection(capabilities.mcpServers ?? [], {
      name: serverName,
      enabled: true,
      action,
    }),
  };
}

export function setAppMcpServerEnabled(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  enabled: boolean,
): AgentCapabilitySelection {
  if (enabled) {
    return {
      ...capabilities,
      appMcpServers: upsertMcpServerSelection(capabilities.appMcpServers ?? [], {
        name: serverName,
        enabled: true,
        action: getAppMcpServerSelection(capabilities, serverName)?.action ?? "allow",
      }),
    };
  }

  return {
    ...capabilities,
    appMcpServers: (capabilities.appMcpServers ?? []).filter(
      (server) => server.name !== serverName,
    ),
    appToolPermissions: (capabilities.appToolPermissions ?? []).filter(
      (rule) => !rule.pattern.startsWith(`${serverName}_`),
    ),
  };
}

export function setAppMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  action: AgentMcpServer["action"],
): AgentCapabilitySelection {
  if (action === "deny") {
    return setAppMcpServerEnabled(capabilities, serverName, false);
  }

  return {
    ...capabilities,
    appMcpServers: upsertMcpServerSelection(capabilities.appMcpServers ?? [], {
      name: serverName,
      enabled: true,
      action,
    }),
  };
}

export function getMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): AgentPermissionRule["action"] {
  return getMcpServerSelection(capabilities, serverName)?.action ?? "deny";
}

export function getAppMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): AgentPermissionRule["action"] {
  return getAppMcpServerSelection(capabilities, serverName)?.action ?? "deny";
}
