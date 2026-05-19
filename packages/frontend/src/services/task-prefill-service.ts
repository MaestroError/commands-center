import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { getMessageAttachments } from "@/components/chat/attachment-utils";
import { isMentionableWorkspacePath } from "@/components/chat/file-mention";
import { parseUserMessage } from "@/components/chat/user-message-utils";
import type { TaskPromptValue } from "@/components/tasks/task-prompt";

export type TaskCreationPrefill = {
  agentId: string;
  prompt: TaskPromptValue;
};

export type TaskPrefillResult = {
  prefill: TaskCreationPrefill;
  hasUnsupportedAttachments: boolean;
};

type CreateTaskPrefillOptions = {
  message: ConversationMessage;
  parts: ConversationPart[];
  agentId: string;
  skills?: { slug: string; description?: string }[];
};

export function createTaskPrefillFromUserMessage(
  options: CreateTaskPrefillOptions,
): TaskPrefillResult {
  const raw = getUserMessageText(options.message, options.parts);
  const parsed = parseUserMessage(raw);
  const supportedSkill = options.skills?.find((skill) => skill.slug === parsed.skill) ?? null;
  const mentionedFiles = parsed.files
    .filter((file) => isMentionableWorkspacePath(file.path))
    .map((file) => ({ path: file.path, filename: file.display }));

  return {
    prefill: {
      agentId: options.agentId,
      prompt: {
        text: parsed.text,
        mentionedFiles,
        selectedSkill: supportedSkill
          ? { slug: supportedSkill.slug, description: supportedSkill.description }
          : null,
      },
    },
    hasUnsupportedAttachments:
      getMessageAttachments(options.message.attachments ?? [], options.parts).length > 0,
  };
}

export function isTaskCreationPrefill(value: unknown): value is TaskCreationPrefill {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TaskCreationPrefill>;

  return (
    typeof candidate.agentId === "string" &&
    Boolean(candidate.prompt) &&
    typeof candidate.prompt?.text === "string" &&
    Array.isArray(candidate.prompt.mentionedFiles) &&
    (candidate.prompt.selectedSkill === null || typeof candidate.prompt.selectedSkill === "object")
  );
}

function getUserMessageText(message: ConversationMessage, parts: ConversationPart[]): string {
  const textPart = parts.find((part) => part.type === "text");
  return (textPart?.["text"] as string | undefined) ?? message.content;
}
