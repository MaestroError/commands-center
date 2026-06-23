import type { SystemPromptDefinition } from "../types.js";

/**
 * Optional, empty by default. Until the operator edits it, the resolved body is
 * empty and the compose step drops it, so it contributes nothing. Declares the
 * full variable catalog because the operator may reference anything.
 */
export const additionalPrompt: SystemPromptDefinition = {
  id: "additional",
  title: "Additional",
  description:
    "Extra global instructions appended to every message. Empty by default — when blank it is not sent.",
  scope: "both",
  order: 30,
  optional: true,
  danger: false,
  enabledByDefault: true,
  workspaceRelativePath: "configuration/system-prompts/additional.md",
  variables: [
    "APP_NAME",
    "CURRENT_DATE",
    "WORKSPACE_DIR",
    "CONVERSATION_ID",
    "SPECIALIST_NAME",
    "SPECIALIST_SLUG",
    "SPECIALIST_ROLE",
    "SPECIALIST_INSTRUCTIONS",
    "CC_DEFAULT_TOOLS",
    "TASK_ID",
    "TASK_TITLE",
    "TASK_RUN_ID",
  ],
  defaultBody: "",
};
