import type { SystemPromptDefinition } from "../types.js";

// Companion instruction for the cc_tasks_management MCP group. Ships empty —
// operators can add guidance in Settings; injected only while the group is
// enabled for the specialist.
export const mcpInstructionsTasksManagementPrompt: SystemPromptDefinition = {
  id: "mcp-instructions-tasks-management",
  title: "MCP: Tasks Management",
  description:
    "Optional usage guidance for the cc_tasks_management MCP group. Injected only while that group is enabled for the specialist.",
  scope: "both",
  order: 43,
  optional: true,
  danger: false,
  enabledByDefault: false,
  capabilityControlled: true,
  workspaceRelativePath: "configuration/system-prompts/mcp-instructions-tasks-management.md",
  variables: ["WORKSPACE_DIR", "SPECIALIST_DIR"],
  defaultBody: "",
};
