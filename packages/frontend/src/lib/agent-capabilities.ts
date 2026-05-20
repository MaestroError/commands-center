import type {
  AgentCapabilitySelection,
  AgentMcpOverride,
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
    mcpServers: upsertMcpServerSelection(capabilities.mcpServers ?? [], {
      name: serverName,
      enabled: false,
      action: "deny",
    }),
    toolPermissions: removeMcpToolPermissions(capabilities, serverName),
  };
}

export function clearMcpServerOverride(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): AgentCapabilitySelection {
  return {
    ...capabilities,
    mcpServers: (capabilities.mcpServers ?? []).filter((server) => server.name !== serverName),
    toolPermissions: removeMcpToolPermissions(capabilities, serverName),
  };
}

export function setMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  action: AgentMcpOverride,
): AgentCapabilitySelection {
  if (action === "none") {
    return clearMcpServerOverride(capabilities, serverName);
  }

  if (action === "disabled") {
    return {
      ...capabilities,
      mcpServers: upsertMcpServerSelection(capabilities.mcpServers ?? [], {
        name: serverName,
        enabled: false,
        action: "deny",
      }),
      toolPermissions: removeMcpToolPermissions(capabilities, serverName),
    };
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
    appToolPermissions: (capabilities.appToolPermissions ?? []).filter(
      (rule) => !rule.pattern.startsWith(`${serverName}_`),
    ),
  };
}

export function getAppMcpToolAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  toolName: string,
): "allow" | "deny" {
  const pattern = buildAppMcpToolPattern(serverName, toolName);
  const exact = (capabilities.appToolPermissions ?? []).find((rule) => rule.pattern === pattern);

  return exact?.action === "deny" ? "deny" : "allow";
}

export function setAppMcpToolEnabled(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  toolName: string,
  enabled: boolean,
): AgentCapabilitySelection {
  const pattern = buildAppMcpToolPattern(serverName, toolName);
  const remaining = (capabilities.appToolPermissions ?? []).filter(
    (rule) => rule.pattern !== pattern,
  );

  return {
    ...capabilities,
    appToolPermissions: enabled ? remaining : [...remaining, { pattern, action: "deny" as const }],
  };
}

export function getMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): AgentMcpOverride {
  const selection = getMcpServerSelection(capabilities, serverName);

  if (!selection) {
    return "none";
  }

  return selection.enabled === false || selection.action === "deny" ? "disabled" : selection.action;
}

function buildAppMcpToolPattern(serverName: string, toolName: string): string {
  return `${serverName}_${toolName}`;
}

function removeMcpToolPermissions(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): NonNullable<AgentCapabilitySelection["toolPermissions"]> {
  return (capabilities.toolPermissions ?? []).filter(
    (rule) => !rule.pattern.startsWith(`${serverName}_`),
  );
}

export function getAppMcpServerAction(
  capabilities: AgentCapabilitySelection,
  serverName: string,
): AgentPermissionRule["action"] {
  return getAppMcpServerSelection(capabilities, serverName)?.action ?? "deny";
}
