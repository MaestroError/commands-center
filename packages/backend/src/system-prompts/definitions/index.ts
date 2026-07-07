import type { SystemPromptDefinition } from "../types.js";
import { additionalPrompt } from "./additional.js";
import { globalChatPrompt } from "./global-chat.js";
import { globalTaskPrompt } from "./global-task.js";
import { identityPrompt } from "./identity.js";
import { mcpInstructionsAppPrompt } from "./mcp-instructions-app.js";
import { mcpInstructionsNotificationsPrompt } from "./mcp-instructions-notifications.js";
import { mcpInstructionsSpecialistManagementPrompt } from "./mcp-instructions-specialist-management.js";
import { mcpInstructionsTasksManagementPrompt } from "./mcp-instructions-tasks-management.js";

/** Ordered registry. Adding a prompt = add a file + register it here. */
export const systemPromptDefinitions: SystemPromptDefinition[] = [
  identityPrompt,
  globalChatPrompt,
  globalTaskPrompt,
  additionalPrompt,
  mcpInstructionsNotificationsPrompt,
  mcpInstructionsAppPrompt,
  mcpInstructionsSpecialistManagementPrompt,
  mcpInstructionsTasksManagementPrompt,
].sort((a, b) => a.order - b.order);

export function getDefinition(id: string): SystemPromptDefinition | undefined {
  return systemPromptDefinitions.find((definition) => definition.id === id);
}
