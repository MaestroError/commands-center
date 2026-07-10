import type { SystemPromptDefinition } from "../types.js";

// Companion instruction for the cc_specialist_management MCP group. Ships empty
// — operators can add guidance in Settings; injected only while the group is
// enabled for the specialist.
export const mcpInstructionsSpecialistManagementPrompt: SystemPromptDefinition = {
  id: "mcp-instructions-specialist-management",
  title: "MCP: Specialist Management",
  description:
    "Optional usage guidance for the cc_specialist_management MCP group. Injected only while that group is enabled for the specialist.",
  scope: "both",
  order: 42,
  optional: true,
  danger: false,
  enabledByDefault: false,
  capabilityControlled: true,
  workspaceRelativePath: "configuration/system-prompts/mcp-instructions-specialist-management.md",
  variables: ["WORKSPACE_DIR", "SPECIALIST_DIR"],
  defaultBody: "",
};
