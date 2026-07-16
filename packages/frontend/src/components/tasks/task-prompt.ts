import { buildMentionPrefix, type MentionedFile } from "@/components/chat/file-mention";

export type TaskPromptValue = {
  text: string;
  mentionedFiles: MentionedFile[];
  mentionedAgents: { id: string; name: string }[];
  selectedSkill: { slug: string; description?: string } | null;
};

export function buildTaskPromptText(value: TaskPromptValue): string {
  const text = value.text.trim();
  const filePrefixes = buildMentionPrefix(value.mentionedFiles);
  const skillPrefix = value.selectedSkill ? `Use skill "${value.selectedSkill.slug}".` : "";

  return [skillPrefix, filePrefixes, text].filter(Boolean).join(" ");
}

export function createTaskPromptValue(text = ""): TaskPromptValue {
  return { text, mentionedFiles: [], mentionedAgents: [], selectedSkill: null };
}
