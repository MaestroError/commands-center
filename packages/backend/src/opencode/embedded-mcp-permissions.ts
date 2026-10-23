import type { TaskPermissionProfile } from "@cc/shared/schemas";

export function mcpPermissionAction(server: string, tool: string): string {
  return `cc_mcp:${encodeURIComponent(server).replaceAll("*", "%2A")}:${encodeURIComponent(tool).replaceAll("*", "%2A")}`;
}

export function mcpRuntimeToolId(server: string, tool: string): string {
  return `${server.replace(/[^a-zA-Z0-9_-]/g, "_")}_${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function mcpSnapshotRules(profile: TaskPermissionProfile) {
  if (!profile.mcpToolPermissions) return [];
  return [
    { permission: "cc_mcp:*", pattern: "*", action: "deny" as const },
    ...profile.mcpToolPermissions.flatMap((rule) =>
      [mcpPermissionAction(rule.server, rule.tool), mcpRuntimeToolId(rule.server, rule.tool)].map(
        (permission) => ({
          permission,
          pattern: "*",
          action: rule.action === "ask" ? ("allow" as const) : rule.action,
        }),
      ),
    ),
  ];
}
