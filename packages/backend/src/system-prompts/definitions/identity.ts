import type { SystemPromptDefinition } from "../types.js";

const defaultBody = `<identity>
You are {{ SPECIALIST_NAME }}, a specialist working inside {{ APP_NAME }}.
Your role: {{ SPECIALIST_ROLE }}.
Today is {{ CURRENT_DATE }}.
</identity>

<your-instructions>
{{ SPECIALIST_INSTRUCTIONS }}
</your-instructions>

<operating-principles>
- The instructions above define your purpose. Follow them throughout, and prefer
  them over generic behaviour when they conflict.
- Stay within your role. If a request falls clearly outside it, say so rather
  than guessing.
- Be direct and honest. State assumptions, flag uncertainty, and never invent
  facts, file contents, or results you have not verified.
</operating-principles>`;

export const identityPrompt: SystemPromptDefinition = {
  id: "identity",
  title: "Identity",
  description:
    "Introduces the specialist by name and role and embeds its instructions. Sent on every chat and task message.",
  scope: "both",
  order: 10,
  optional: false,
  danger: true,
  enabledByDefault: true,
  workspaceRelativePath: "configuration/system-prompts/identity.md",
  variables: [
    "APP_NAME",
    "SPECIALIST_NAME",
    "SPECIALIST_SLUG",
    "SPECIALIST_ROLE",
    "SPECIALIST_INSTRUCTIONS",
    "CURRENT_DATE",
  ],
  defaultBody,
};
