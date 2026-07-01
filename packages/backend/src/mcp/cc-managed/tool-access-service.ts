import type { SpecialistCapabilitySelection } from "../../schemas/specialists.js";
import type { CcManagedMcpServerDefinition, CcManagedToolDefinition } from "./server-registry.js";

export function createCcManagedMcpToolAccessService() {
  return {
    isServerEnabled(
      capabilities: SpecialistCapabilitySelection,
      server: CcManagedMcpServerDefinition,
    ): boolean {
      const selection = capabilities.appMcpServers?.find((entry) => entry.name === server.name);

      if (!selection) {
        return server.enabledByDefault;
      }

      return selection.enabled !== false && selection.action !== "deny";
    },

    // Tool listing is context-agnostic: every capability-enabled tool is
    // advertised for both chat and task-run sessions. `context` is advisory
    // metadata surfaced in the tool description, not a visibility gate.
    listEnabledTools(
      capabilities: SpecialistCapabilitySelection,
      server: CcManagedMcpServerDefinition,
    ): readonly CcManagedToolDefinition[] {
      if (!this.isServerEnabled(capabilities, server)) {
        return [];
      }

      return server.tools.filter(
        (tool) => this.getToolAction(capabilities, server.name, tool.name) !== "deny",
      );
    },

    getToolAction(
      capabilities: SpecialistCapabilitySelection,
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

export function buildCcManagedToolPermissionPattern(serverName: string, toolName: string): string {
  return `${serverName}_${toolName}`;
}

export type CcManagedMcpToolAccessService = ReturnType<typeof createCcManagedMcpToolAccessService>;
