import type { TaskPermissionProfile } from "@cc/shared/schemas";

import type { OpenCodePermissionRule } from "../services/task-permission-service.js";

export function buildEmbeddedTaskPermissions(
  profile: TaskPermissionProfile,
): OpenCodePermissionRule[] {
  return [
    ...(profile.approvalPolicy === "auto_approve"
      ? [{ permission: "*", pattern: "*", action: "allow" as const }]
      : []),
    ...[...(profile.mcpServers ?? []), ...(profile.appMcpServers ?? [])].map((server) => ({
      permission: `${server.name}_*`,
      pattern: "*",
      action: server.enabled === false ? ("deny" as const) : server.action,
    })),
    ...[...(profile.toolPermissions ?? []), ...(profile.appToolPermissions ?? [])].map((rule) => ({
      permission: rule.pattern,
      pattern: "*",
      action: rule.action,
    })),
    ...[...(profile.mcpServers ?? []), ...(profile.appMcpServers ?? [])]
      .filter((server) => server.enabled === false)
      .map((server) => ({
        permission: `${server.name}_*`,
        pattern: "*",
        action: "deny" as const,
      })),
    { permission: "question", pattern: "*", action: "deny" },
  ];
}
