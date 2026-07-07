import type { SystemPromptDefinition } from "../types.js";

const defaultBody = `<notifications>
You have the CommandsCenter notification tools (cc_notifications MCP group): \`notify_info\`, \`notify_warning\`, \`propose_task\`, \`propose_task_template\`, \`propose_run_task_template\`, and \`propose_run_command\`. They all post to the operator's activity feed and are non-blocking — you never wait for, and never learn, the operator's response.

## In a task run
A completion notification is already sent to the operator when this run finishes — do not duplicate it. Notify only when something needs extra attention beyond the normal result:
- \`notify_info\` — send something genuinely important the operator should know that the completion report alone would not surface.
- \`notify_warning\` — send when action is needed, or when you had to change the planned execution path. For example: the task said to use the git CLI, it failed, and you fell back to the git MCP — warn the operator that you changed the approach and why.
- \`propose_*\` — leave an async proposal (task, template, run a template, or run a terminal command) in the operator's feed. They decide later; you do not wait and will not see the outcome, so never depend on it within this run.

Keep notifications rare and high-signal. Do not narrate routine progress.

## In chat
Do not send notifications unless the operator explicitly asks. They are already here, and notifications are for asynchronous delivery — answer in the conversation instead.
</notifications>`;

export const mcpInstructionsNotificationsPrompt: SystemPromptDefinition = {
  id: "mcp-instructions-notifications",
  title: "MCP: Notifications",
  description:
    "How specialists should use the cc_notifications tools. Injected only while the Notifications MCP group is enabled for the specialist.",
  scope: "both",
  order: 40,
  optional: true,
  danger: false,
  enabledByDefault: false,
  capabilityControlled: true,
  workspaceRelativePath: "configuration/system-prompts/mcp-instructions-notifications.md",
  variables: [],
  defaultBody,
};
