export type ParsedUserMessageFile = {
  path: string;
  display: string;
  isFolder: boolean;
};

export function parseUserMessage(raw: string): {
  skill: string | null;
  files: ParsedUserMessageFile[];
  text: string;
} {
  let text = raw;
  let skill: string | null = null;
  const files: ParsedUserMessageFile[] = [];

  const skillMatch = text.match(/^Use skill "([^"]+)"\.\s*/);
  if (skillMatch) {
    skill = skillMatch[1] ?? null;
    text = text.slice(skillMatch[0].length);
  }

  const filePattern = /^#(\S+)\s*/;
  let match = filePattern.exec(text);
  while (match) {
    const path = match[1]!;
    const isFolder = path.endsWith("/");
    files.push({
      path,
      display: isFolder ? path : (path.split("/").pop() ?? path),
      isFolder,
    });
    text = text.slice(match[0].length);
    match = filePattern.exec(text);
  }

  return { skill, files, text: text.trim() };
}
