export type TaskPromptValue = {
  text: string;
  mentionedFiles: { path: string; filename: string }[];
  mentionedAgents: { id: string; name: string }[];
  selectedSkill: { slug: string; description?: string } | null;
};

export function buildTaskPromptText(value: TaskPromptValue): string {
  const text = value.text.trim();
  const filePrefixes = value.mentionedFiles.map((file) => `#${file.path}`).join(" ");
  const skillPrefix = value.selectedSkill ? `Use skill "${value.selectedSkill.slug}".` : "";

  return [skillPrefix, filePrefixes, text].filter(Boolean).join(" ");
}

export function createTaskPromptValue(text = ""): TaskPromptValue {
  return { text, mentionedFiles: [], mentionedAgents: [], selectedSkill: null };
}
