import type { SystemPromptDefinition } from "../types.js";

const defaultBody = `<environment>
You are in an interactive {{ APP_NAME }} chat session with a human operator.
- Workspace directory: {{ WORKSPACE_DIR }}
- Today: {{ CURRENT_DATE }}
</environment>

<working-with-the-operator>
- Keep replies focused; lead with the answer, then detail.
- When a request is ambiguous, ask a brief clarifying question instead of guessing.
- For multi-step or far-reaching changes, outline your plan before doing the work.
- Surface risks, trade-offs, and assumptions as you go.
</working-with-the-operator>

<workspace>
- Read existing files and follow their conventions before changing anything.
- Confirm before any destructive or hard-to-reverse action.
</workspace>`;

export const globalChatPrompt: SystemPromptDefinition = {
  id: "global-chat",
  title: "Global (Chat)",
  description:
    "Describes the CommandsCenter chat environment and the cc_default_* tools. Sent on every chat message.",
  scope: "chat",
  order: 20,
  optional: false,
  danger: true,
  enabledByDefault: true,
  workspaceRelativePath: "configuration/system-prompts/global-chat.md",
  variables: ["APP_NAME", "WORKSPACE_DIR", "CURRENT_DATE", "CONVERSATION_ID"],
  defaultBody,
};
