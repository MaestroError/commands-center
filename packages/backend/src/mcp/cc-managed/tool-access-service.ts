import type { AgentCapabilitySelection } from "../../schemas/agents.js";
import type { CcManagedMcpServerDefinition, CcManagedToolDefinition } from "./server-registry.js";

export function createCcManagedMcpToolAccessService() {
  return {
    isServerEnabled(
      capabilities: AgentCapabilitySelection,
      server: CcManagedMcpServerDefinition,
    ): boolean {
      const selection = capabilities.appMcpServers?.find((entry) => entry.name === server.name);

      if (!selection) {
        return server.enabledByDefault;
      }

      return selection.enabled !== false && selection.action !== "deny";
    },

    listEnabledTools(
      capabilities: AgentCapabilitySelection,
      server: CcManagedMcpServerDefinition,
      context: "chat" | "task_run" = "chat",
    ): readonly CcManagedToolDefinition[] {
      if (!this.isServerEnabled(capabilities, server)) {
        return [];
      }

      return server.tools.filter(
        (tool) =>
          isToolAvailableInContext(tool, context) &&
          this.getToolAction(capabilities, server.name, tool.name) !== "deny",
      );
    },

    getToolAction(
      capabilities: AgentCapabilitySelection,
      serverName: string,
      toolName: string,
    ): "allow" | "ask" | "deny" {
      const pattern = buildCcManagedToolPermissionPattern(serverName, toolName);
      const rules = capabilities.appToolPermissions ?? [];
      const exact = rules.find((rule) => rule.pattern === pattern);

      if (exact) {
        return exact.action;
      }

      return "allow";
    },
  };
}

export function isToolAvailableInContext(
  tool: CcManagedToolDefinition | { context: CcManagedToolDefinition["context"] },
  context: "chat" | "task_run",
): boolean {
  return tool.context === "both" || tool.context === context;
}

export function buildCcManagedToolPermissionPattern(serverName: string, toolName: string): string {
  return `${serverName}_${toolName}`;
}

export type CcManagedMcpToolAccessService = ReturnType<typeof createCcManagedMcpToolAccessService>;
