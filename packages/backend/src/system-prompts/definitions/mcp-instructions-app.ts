import type { SystemPromptDefinition } from "../types.js";

// Companion instruction for the cc_app MCP group (custom-tool authoring and
// operator-interactive drafts). Ships empty — operators can add guidance in
// Settings; it is injected only while the group is enabled for the specialist.
export const mcpInstructionsAppPrompt: SystemPromptDefinition = {
  id: "mcp-instructions-app",
  title: "MCP: App Tools",
  description:
    "Optional usage guidance for the cc_app MCP group. Injected only while that group is enabled for the specialist.",
  scope: "both",
  order: 41,
  optional: true,
  danger: false,
  enabledByDefault: false,
  capabilityControlled: true,
  workspaceRelativePath: "configuration/system-prompts/mcp-instructions-app.md",
  variables: ["WORKSPACE_DIR", "SPECIALIST_DIR"],
  defaultBody: "",
};
