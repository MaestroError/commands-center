import type { SystemPromptDefinition } from "../types.js";
import { additionalPrompt } from "./additional.js";
import { globalChatPrompt } from "./global-chat.js";
import { globalTaskPrompt } from "./global-task.js";
import { identityPrompt } from "./identity.js";

/** Ordered registry. Adding a prompt = add a file + register it here. */
export const systemPromptDefinitions: SystemPromptDefinition[] = [
  identityPrompt,
  globalChatPrompt,
  globalTaskPrompt,
  additionalPrompt,
].sort((a, b) => a.order - b.order);

export function getDefinition(id: string): SystemPromptDefinition | undefined {
  return systemPromptDefinitions.find((definition) => definition.id === id);
}
